{
  pkgs,
  nodejs,
  package,
  packageLock,
  npmSources,
}:
let
  # Bind the importer's node-gyp/header substitutions to the check runtime too.
  npmConfigHook =
    (pkgs.callPackage (pkgs.path + /pkgs/build-support/node/import-npm-lock/hooks) {
      inherit nodejs;
    }).npmConfigHook;
  archives = pkgs.lib.mapAttrs (_: source: source.archive) npmSources;
  unpreparedGit = pkgs.lib.filterAttrs (
    modulePath: module: pkgs.lib.hasPrefix "git" (module.resolved or "") && !(archives ? ${modulePath})
  ) packageLock.packages;
  resolveDependency =
    modulePath: name:
    let
      candidate =
        if modulePath == "" then "node_modules/${name}" else "${modulePath}/node_modules/${name}";
      parent = builtins.match "(.*)/node_modules/(@[^/]+/)?[^/]+" modulePath;
    in
    if packageLock.packages ? ${candidate} then
      candidate
    else if modulePath == "" then
      throw "Unresolved locked dependency ${name}"
    else
      resolveDependency (if parent == null then "" else builtins.head parent) name;
  normalizeEdges =
    modulePath: dependencies:
    pkgs.lib.mapAttrs (
      name: spec:
      if pkgs.lib.hasPrefix "git" spec then
        let
          target = resolveDependency modulePath name;
        in
        assert archives ? ${target};
        packageLock.packages.${target}.version
      else
        spec
    ) dependencies;
in
assert
  unpreparedGit == { }
  || throw "Git dependencies require reviewed prepared archives: ${builtins.toJSON (builtins.attrNames unpreparedGit)}";
{
  inherit npmConfigHook;
  npmDeps = pkgs.importNpmLock {
    inherit package;
    # Source overrides invalidate any integrity belonging to the old source.
    packageLock = packageLock // {
      packages = pkgs.lib.mapAttrs (
        modulePath: module:
        (if archives ? ${modulePath} then builtins.removeAttrs module [ "integrity" ] else module)
        // pkgs.lib.optionalAttrs (module ? dependencies) {
          dependencies = normalizeEdges modulePath module.dependencies;
        }
        // pkgs.lib.optionalAttrs (module ? optionalDependencies) {
          optionalDependencies = normalizeEdges modulePath module.optionalDependencies;
        }
      ) packageLock.packages;
    };
    packageSourceOverrides = archives;
  };
}
