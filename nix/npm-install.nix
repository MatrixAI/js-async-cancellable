{
  pkgs,
  packageName,
  sources,
}:
let
  plan = pkgs.writeText "npm-source-overrides.json" (
    builtins.toJSON {
      inherit packageName;
      sources = builtins.mapAttrs (_: source: source // { archive = toString source.archive; }) sources;
    }
  );
in
pkgs.writeShellApplication {
  name = "npm";
  runtimeInputs = [ pkgs.nodejs_24 ];
  text = ''
    export PATH="''${0%/*}:$PATH"
    exec ${pkgs.nodejs_24}/bin/node ${../scripts/npm-install.mjs} \
      ${pkgs.nodejs_24}/bin/npm ${pkgs.util-linux}/bin/flock ${plan} "$@"
  '';
}
