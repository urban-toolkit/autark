{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShellNoCC {
  packages = with pkgs; [
    gnumake
    nodejs_22
  ];
}
