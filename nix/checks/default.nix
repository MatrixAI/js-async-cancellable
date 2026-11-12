{
  pkgs,
  nodejs,
  lint,
  system,
  gitignore,
  npmDependencies,
}:
let
  src = gitignore.gitignoreSource ../..;
  unit-js = import ./unit-js.nix {
    inherit
      pkgs
      nodejs
      system
      src
      ;
    inherit (npmDependencies) npmDeps npmConfigHook;
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
