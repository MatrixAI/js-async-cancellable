{
  pkgs,
  nodejs,
  system,
  src,
  libraryBuild,
  installedDependencies,
  setupDependencies,
}:
pkgs.stdenv.mkDerivation {
  pname = "async-cancellable-unit-js";
  version = "0";
  inherit src;
  nativeBuildInputs = [ nodejs ];
  dontBuild = true;
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    ${setupDependencies}
    # Vitest 5.1 writes TypeScript build info beside its own distribution.
    # Copy it out of the read-only dependency store for this check only.
    mkdir -p tmp/vitest
    cp -R ${installedDependencies}/node_modules/vitest tmp/vitest/package
    chmod -R u+w tmp/vitest/package
    rm node_modules/vitest
    ln -s ../tmp/vitest/package node_modules/vitest
    ln -s ${libraryBuild}/dist dist
    npm test -- --prebuilt
    runHook postCheck
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/artifacts"
    cp -R tmp/junit "$out/artifacts/junit"
    cat > "$out/report.json" <<EOF
    {
      "schemaVersion": 1,
      "name": "unit-js",
      "kind": "unit-test",
      "status": "passed",
      "system": "${system}",
      "summary": "Node build and Vitest runtime and type cases passed",
      "artifacts": { "junit": "artifacts/junit" }
    }
    EOF
    runHook postInstall
  '';
}
