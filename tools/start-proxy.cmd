@echo off
set NODE_OPTIONS=--use-system-ca
node "%~dp0npm-registry-proxy.js"