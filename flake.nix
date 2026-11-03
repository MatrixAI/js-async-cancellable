{
  inputs = {
    nixpkgs-matrixai = {
      type = "indirect";
      id = "nixpkgs-matrixai";
    };
    nixpkgs.follows = "nixpkgs-matrixai/nixpkgs";
    flake-parts.follows = "nixpkgs-matrixai/flake-parts";
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      devenv,
      flake-parts,
      nixpkgs-matrixai,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ devenv.flakeModule ];
      systems = [ "x86_64-linux" ];

      perSystem =
        { config, system, ... }:
        let
          pkgs = nixpkgs-matrixai.legacyPackages.${system};
          nodejs = pkgs.nodejs_24;
          lint = pkgs.matrixai-lint.withTools [
            pkgs.nixfmt
            pkgs.shellcheck
          ];
          package = builtins.fromJSON (builtins.readFile ./package.json);
          packageLock = builtins.fromJSON (builtins.readFile ./package-lock.json);
          npmSources = import ./nix/npm-sources.nix {
            inherit system packageLock;
            selections = {
              "node_modules/@matrixai/contexts".name = "@matrixai/contexts";
            };
          };
          npm = import ./nix/npm-install.nix {
            inherit pkgs;
            packageName = package.name;
            sources = npmSources;
          };
          npmDependencies = import ./nix/npm-deps.nix {
            inherit
              pkgs
              nodejs
              package
              packageLock
              npmSources
              ;
          };
          runtimeProviders =
            builtins.map
              (selected: {
                name = selected.archive.npmPackage.name;
                version = selected.archive.npmPackage.version;
                source = selected.source;
                archiveOutput = selected.output;
              })
              (
                builtins.filter (selected: builtins.hasAttr selected.name (package.dependencies or { })) (
                  builtins.attrValues npmSources
                )
              );
          npmPackage = import ./nix/npm-package.nix {
            inherit pkgs nodejs npmDependencies;
            gitignore = nixpkgs-matrixai.lib.gitignore;
            inherit runtimeProviders;
            sourceProvenance = {
              rev = if inputs.self ? dirtyRev then null else inputs.self.rev or null;
              dirtyRev = inputs.self.dirtyRev or null;
              narHash = inputs.self.narHash or null;
              dirty =
                if inputs.self ? dirtyRev then
                  true
                else if inputs.self ? rev then
                  false
                else
                  null;
            };
          };
          browserEnvironment = {
            CHECK_PLAYWRIGHT_VERSION = pkgs.playwright-driver.version;
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
          };
        in
        {
          packages = {
            default = npmPackage.out;
            npm-package = npmPackage.out;
            npm-package-unpacked = npmPackage.unpacked;
          };
          apps.npm = {
            type = "app";
            program = "${npm}/bin/npm";
          };
          formatter = lint.formatter;

          checks = import ./nix/checks {
            inherit
              pkgs
              nodejs
              lint
              system
              npmDependencies
              ;
            gitignore = nixpkgs-matrixai.lib.gitignore;
          };
          devShells.ci = config.devShells.default;
          devenv.shells.default = { lib, ... }: {
            containers = lib.mkForce { };
            devenv.root = lib.mkForce (
              let
                root = builtins.getEnv "PWD";
              in
              if root == "" then toString ./. else root
            );
            packages = [
              nodejs
              (pkgs.lib.hiPrio npm)
              lint
            ];
            env = browserEnvironment;
            enterShell = ''
              export PATH="${lint}/bin:${npm}/bin:$PWD/dist/bin:$PWD/node_modules/.bin:$PATH"
              npm install --no-audit --fund=false --prefer-offline || return "$?"
            '';
          };
        };
    };
}
