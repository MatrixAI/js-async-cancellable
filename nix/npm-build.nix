{
  pkgs,
  nodejs,
  gitignore,
  setupDependencies,
}:
let
  src = gitignore.gitignoreSource ../.;
  buildSource = pkgs.lib.cleanSourceWith {
    inherit src;
    filter =
      path: _type:
      let
        relative = pkgs.lib.removePrefix "${toString src}/" (toString path);
      in
      # The package build must not consume tests, specs, or check adapters.
      !(builtins.elem relative [
        "tests"
        "specs"
        "nix/checks"
        "playwright.config.ts"
      ]);
  };
in
pkgs.stdenv.mkDerivation {
  pname = "library-build";
  version = "0";
  src = buildSource;
  nativeBuildInputs = [ nodejs ];
  buildPhase = ''
    runHook preBuild
    ${setupDependencies}
    npm run build
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -R dist "$out/dist"
    runHook postInstall
  '';
}
