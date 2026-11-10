/* Where the setup file `basisTest()` adds (fixtures-setup.ts) leaves `checkRoutes` its loader of the app's fixtures:
 * a key in the global registry, so the setup file and `@basis/ui/testing` find the same one however each was loaded. */

const fixturesKey = Symbol.for("@basis/ui/testing:fixtures");

export { fixturesKey };
