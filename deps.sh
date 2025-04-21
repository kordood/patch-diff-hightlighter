#!/bin/bash

npm install --save-dev typescript @types/vscode
npx tsc --init --rootDir src --outDir out --module commonjs --target es6 --lib es6