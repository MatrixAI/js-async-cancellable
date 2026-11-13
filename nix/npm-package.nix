{
  pkgs,
  nodejs,
  gitignore,
  npmDependencies,
  libraryBuild,
  runtimeProviders,
  sourceProvenance,
}:
let
  src = gitignore.gitignoreSource ../.;
  package = builtins.fromJSON (builtins.readFile ../package.json);
  pname = builtins.replaceStrings [ "@" "/" ] [ "" "-" ] package.name;
in
pkgs.buildNpmPackage {
  inherit pname src nodejs;
  version = package.version;
  name = "${pname}-${package.version}.tgz";
  outputs = [
    "out"
    "unpacked"
  ];
  inherit (npmDependencies) npmDeps npmConfigHook;
  dontNpmBuild = true;

  # The importNpmLock hook restores these after its temporary source rewrites.
  # Fail before compilation/packing if that hook's contract ever changes.
  preBuild = ''
    cmp package.json ${../package.json}
    cmp package-lock.json ${../package-lock.json}
    cp -R ${libraryBuild}/dist dist
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$TMPDIR/npm-pack" "$unpacked"
    npm_config_cache="$TMPDIR/npm-pack-cache" \
      npm pack --offline --ignore-scripts --pack-destination "$TMPDIR/npm-pack"
    archives=("$TMPDIR/npm-pack"/*.tgz)
    test "''${#archives[@]}" -eq 1
    test -f "''${archives[0]}"
    mv "''${archives[0]}" "$out"
    tar -xzf "$out" -C "$unpacked" --strip-components=1
    cmp "$unpacked/package.json" ${../package.json}

    runHook postInstall
  '';

  # This package contains portable JavaScript, not native executables. Do not
  # mutate the unpacked view independently or inject runtime store references.
  dontFixup = true;

  passthru = {
    npmPackage = {
      schemaVersion = 1;
      format = "npm-tgz";
      inherit (package) name version;
      dependencies = package.dependencies or { };
      peerDependencies = package.peerDependencies or { };
      peerDependenciesMeta = package.peerDependenciesMeta or { };
      optionalDependencies = package.optionalDependencies or { };
      engines = package.engines or { };
      bin = package.bin or { };
      source = sourceProvenance;
    };
    npmDistribution = {
      schemaVersion = 1;
      archiveOutput = "npm-package";
      inherit runtimeProviders;
    };
  };

  meta = {
    description = package.description;
    license = pkgs.lib.meta.getLicenseFromSpdxId package.license;
    outputsToInstall = [ "out" ];
  };
}
