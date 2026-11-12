{
  pkgs,
  nodejs,
  system,
  src,
  npmDeps,
  npmConfigHook,
}:
pkgs.buildNpmPackage {
  pname = "async-cancellable-unit-js";
  version = "0";
  inherit
    src
    nodejs
    npmDeps
    npmConfigHook
    ;
  dontNpmBuild = true;
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run build
    npm test
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
