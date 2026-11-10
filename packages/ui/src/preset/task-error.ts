/** What a task failure throws: its message is the line the task prints. */
class TaskError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskError";
  }
}

export { TaskError };
