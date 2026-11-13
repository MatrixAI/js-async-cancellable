{
  pkgs,
  nodejs,
  lint,
  system,
  gitignore,
  npmDependencies,
  libraryBuild,
  installedDependencies,
  setupDependencies,
}:
let
  src = gitignore.gitignoreSource ../..;
  unit-js = import ./unit-js.nix {
    inherit
      pkgs
      nodejs
      system
      src
      libraryBuild
      installedDependencies
      setupDependencies
      ;
  };
  lintCheck = lint.mkCheck {
    inherit src;
    name = "async-cancellable-lint";
    npmDependencies = npmDependencies // {
      inherit nodejs;
    };
  };
in
{
  inherit unit-js;
  lint = lintCheck;
  default = pkgs.runCommand "async-cancellable-check-default" { } ''
    mkdir -p "$out/artifacts"
    ln -s ${unit-js} "$out/artifacts/unit-js"
    ln -s ${lintCheck} "$out/artifacts/lint"
    cat > "$out/report.json" <<EOF
    {"schemaVersion":1,"name":"default","kind":"aggregate","status":"passed","system":"${system}","artifacts":{"unit-js":"artifacts/unit-js/report.json","lint":"artifacts/lint/report.json"}}
    EOF
  '';
}
