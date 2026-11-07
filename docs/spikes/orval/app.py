"""Spike 0.2's sample API, standing in for basis's until basis publishes an ``openapi.json``.

It follows the contract on basis's design page: operation ids are handler names, every model is strict, every error is
an RFC 9457 problem details response, and the dataset route returns Arrow when the request asks for it. Field errors use
the ``errors`` member from RFC 9457's own example, which basis's contract does not define yet.

Export the document with ``uv run python app.py > openapi.json``; serve it with ``uv run uvicorn app:app``.
"""

import datetime as dt
import json
import sys
import threading
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from decimal import Decimal
from http import HTTPStatus
from typing import Annotated, Any, Final, override
from urllib.parse import quote

import pyarrow as pa
from fastapi import Depends, FastAPI, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException

ARROW_STREAM: Final = "application/vnd.apache.arrow.stream"
PROBLEM_JSON: Final = "application/problem+json"
CLOSED_BOOKS: Final = frozenset({"ARCHIVE"})


class Strict(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, validate_default=True, revalidate_instances="always", allow_inf_nan=False
    )


class StrictBody(BaseModel):
    """basis: "an unknown key is refused and no value is coerced".

    FastAPI validates a parsed body in Python mode, where strict mode refuses the strings JSON uses for dates and
    decimals, so those fields opt out with ``Field(strict=False)``.
    """

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_default=True,
        revalidate_instances="always",
        allow_inf_nan=False,
        strict=True,
    )


class Position(Strict):
    position_id: int
    book: str
    symbol: str
    quantity: int
    price: Decimal
    as_of: dt.date
    note: str | None


class PositionCreate(StrictBody):
    book: Annotated[str, Field(min_length=1, max_length=16)]
    symbol: Annotated[str, Field(pattern=r"^[A-Z0-9]{1,12}$")]
    quantity: Annotated[int, Field(gt=0)]
    price: Annotated[Decimal, Field(strict=False, gt=0, max_digits=18, decimal_places=6)]
    as_of: Annotated[dt.date, Field(strict=False)]
    note: Annotated[str, Field(max_length=200)] | None = None


class PositionFilter(BaseModel):
    """Query strings are text, so the filters coerce; unknown parameters are still refused."""

    model_config = ConfigDict(extra="forbid", frozen=True, validate_default=True)

    book: str | None = None
    symbol: Annotated[list[str], Field(default_factory=list)]
    as_of: dt.date | None = None
    limit: Annotated[int, Field(ge=1, le=1000)] = 100


class Exposure(Strict):
    book: str
    sector: str
    as_of: dt.date
    exposure: Decimal


class Problem(Strict):
    """An RFC 9457 problem details response."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None


class PointerError(Strict):
    detail: str
    pointer: Annotated[
        str, Field(description="A JSON Pointer (RFC 6901), in URI fragment form, to the field in the request body.")
    ]


class ParameterError(Strict):
    detail: str
    parameter: Annotated[str, Field(description="The name of the query or path parameter at fault.")]


class ValidationProblem(Problem):
    """A problem details response for an invalid request, naming each field at fault as RFC 9457's example does."""

    errors: tuple[PointerError | ParameterError, ...]


class ClosedBookError(Exception):
    def __init__(self, book: str) -> None:
        super().__init__(f"Book {book} is closed to new positions.")
        self.book = book


class PositionStore:
    def __init__(self, positions: Sequence[Position], exposures: Sequence[Exposure]) -> None:
        self._positions = {position.position_id: position for position in positions}
        self._exposures = tuple(exposures)
        self._lock = threading.Lock()

    def find(self, filters: PositionFilter) -> list[Position]:
        with self._lock:
            matches = [
                position
                for position in self._positions.values()
                if (filters.book is None or position.book == filters.book)
                and (not filters.symbol or position.symbol in filters.symbol)
                and (filters.as_of is None or position.as_of == filters.as_of)
            ]
        return matches[: filters.limit]

    def get(self, position_id: int) -> Position | None:
        with self._lock:
            return self._positions.get(position_id)

    def add(self, new: PositionCreate) -> Position:
        if new.book in CLOSED_BOOKS:
            raise ClosedBookError(new.book)
        with self._lock:
            position = Position(position_id=max(self._positions, default=0) + 1, **new.model_dump())
            self._positions[position.position_id] = position
        return position

    def exposures(self) -> tuple[Exposure, ...]:
        return self._exposures


_AS_OF = dt.date(2026, 11, 6)
_SEED_POSITIONS = (
    Position(
        position_id=1, book="RATES", symbol="UST10Y", quantity=5000, price=Decimal("98.765625"), as_of=_AS_OF, note=None
    ),
    Position(
        position_id=2, book="RATES", symbol="UST2Y", quantity=12000, price=Decimal("99.875"), as_of=_AS_OF, note=None
    ),
    Position(
        position_id=3,
        book="CREDIT",
        symbol="ACME",
        quantity=750,
        price=Decimal("101.25"),
        as_of=_AS_OF,
        note="On the watch list.",
    ),
)
_SEED_EXPOSURES = (
    Exposure(book="RATES", sector="Government", as_of=_AS_OF, exposure=Decimal("1692406.25")),
    Exposure(book="CREDIT", sector="Industrials", as_of=_AS_OF, exposure=Decimal("75937.50")),
    Exposure(book="CREDIT", sector="Utilities", as_of=_AS_OF, exposure=Decimal("-12500.00")),
)
_EXPOSURE_ARROW = pa.schema(
    [("book", pa.string()), ("sector", pa.string()), ("as_of", pa.date32()), ("exposure", pa.decimal128(18, 2))]
)


def _json_pointer(path: Sequence[object]) -> str:
    tokens = (str(token).replace("~", "~0").replace("/", "~1") for token in path)
    return "#" + "".join("/" + quote(token, safe="~!$&'()*+,;=:@") for token in tokens)


def _field_error(error: object) -> PointerError | ParameterError:
    match error:
        case {"type": "json_invalid", "msg": str(message)}:
            # Pydantic's loc here is the character offset of the syntax error, not a field.
            return PointerError(detail=message, pointer="#")
        case {"loc": ("body", *path), "msg": str(message)}:
            return PointerError(detail=message, pointer=_json_pointer(path))
        case {"loc": ("query" | "path" | "header" | "cookie", str(name), *_), "msg": str(message)}:
            return ParameterError(detail=message, parameter=name)
        case _:
            msg = f"FastAPI reported a validation error of an unknown shape: {error!r}"
            raise TypeError(msg)


def _problem_response(problem: Problem) -> JSONResponse:
    return JSONResponse(
        problem.model_dump(mode="json", exclude_none=True), status_code=problem.status, media_type=PROBLEM_JSON
    )


async def _on_invalid_request(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    errors = tuple(_field_error(error) for error in exc.errors())
    return _problem_response(
        ValidationProblem(
            title="Your request is not valid.", status=status.HTTP_422_UNPROCESSABLE_CONTENT, errors=errors
        )
    )


async def _on_closed_book(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ClosedBookError):
        raise exc
    return _problem_response(
        ValidationProblem(
            title="Your request is not valid.",
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=(PointerError(detail=str(exc), pointer="#/book"),),
        )
    )


async def _on_http_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        raise exc
    problem = Problem(title=HTTPStatus(exc.status_code).phrase, status=exc.status_code, detail=exc.detail)
    response = _problem_response(problem)
    response.headers.update(exc.headers or {})
    return response


async def _on_unexpected(_request: Request, _exc: Exception) -> JSONResponse:
    # Starlette re-raises after this response is sent, and the server logs the traceback once.
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    return _problem_response(Problem(title=HTTPStatus(status_code).phrase, status=status_code))


def _serve_problems_as_problem_json(document: dict[str, Any]) -> None:
    """FastAPI files every declared response's model under application/json; RFC 9457 names application/problem+json.

    The document is FastAPI's untyped JSON, so ``Any`` stays inside this function.
    """
    for path_item in document.get("paths", {}).values():
        for operation in path_item.values():
            for code, response in operation.get("responses", {}).items():
                content = response.get("content", {})
                if (code == "default" or code.startswith(("4", "5"))) and "application/json" in content:
                    content[PROBLEM_JSON] = content.pop("application/json")


class SampleAPI(FastAPI):
    @override
    def openapi(self) -> dict[str, Any]:
        first = self.openapi_schema is None
        document = super().openapi()
        if first:
            _serve_problems_as_problem_json(document)
        return document


def _operation_id(route: APIRoute) -> str:
    return route.name


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None]:
    app.state.store = PositionStore(_SEED_POSITIONS, _SEED_EXPOSURES)
    yield


_PROBLEM: Final[dict[str, Any]] = {"model": Problem, "description": "A problem details response (RFC 9457)."}
_INVALID: Final[dict[str, Any]] = {
    "model": ValidationProblem,
    "description": "The request is not valid. `errors` names each field at fault.",
}

app = SampleAPI(
    title="orval spike API",
    version="0.0.0",
    lifespan=_lifespan,
    generate_unique_id_function=_operation_id,
    dependencies=[Depends(HTTPBearer(auto_error=False))],
    responses={"default": _PROBLEM},
    exception_handlers={
        RequestValidationError: _on_invalid_request,
        ClosedBookError: _on_closed_book,
        HTTPException: _on_http_error,
        Exception: _on_unexpected,
    },
)


def _store(request: Request) -> PositionStore:
    store: object = request.app.state.store
    if not isinstance(store, PositionStore):
        msg = "The app's lifespan did not open the position store."
        raise TypeError(msg)
    return store


StoreDep = Annotated[PositionStore, Depends(_store)]


@app.get("/positions", responses={422: _INVALID})
def get_positions(filters: Annotated[PositionFilter, Query()], store: StoreDep) -> list[Position]:
    return store.find(filters)


@app.get("/positions/{position_id}", responses={404: _PROBLEM, 422: _INVALID})
def get_position(position_id: int, store: StoreDep) -> Position:
    position = store.get(position_id)
    if position is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"No position has id {position_id}.")
    return position


@app.post("/positions", status_code=status.HTTP_201_CREATED, responses={422: _INVALID})
def create_position(body: PositionCreate, store: StoreDep) -> Position:
    return store.add(body)


@app.get(
    "/exposures",
    response_model=list[Exposure],
    responses={
        200: {
            "description": "The exposures, as JSON or, when the request accepts it, as an Arrow IPC stream.",
            "content": {ARROW_STREAM: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
def get_exposures(request: Request, store: StoreDep) -> Response | tuple[Exposure, ...]:
    exposures = store.exposures()
    accepted = (part.split(";", 1)[0].strip() for part in request.headers.get("accept", "").split(","))
    if ARROW_STREAM in accepted:
        return Response(content=_arrow_stream(exposures), media_type=ARROW_STREAM)
    return exposures


def _arrow_stream(rows: Sequence[Exposure]) -> bytes:
    table = pa.Table.from_pylist([row.model_dump() for row in rows], schema=_EXPOSURE_ARROW)
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return bytes(sink.getvalue())


def main() -> None:
    sys.stdout.write(json.dumps(app.openapi(), indent=2) + "\n")


if __name__ == "__main__":
    main()
