#!/bin/bash
cd /Users/john/Desktop/ReplayMod
rm -f replaymod_src.zip

zip replaymod_src.zip \
  shared/**/*.ts \
  shared/**/*.tsx \
  shared/*.ts \
  api/*.ts \
  basketball/src/**/*.ts \
  basketball/src/**/*.tsx \
  basketball/src/*.ts \
  basketball/src/*.tsx \
  basketball/src/adapters/*.ts \
  worldcup/src/**/*.ts \
  worldcup/src/**/*.tsx

echo "Done:"
ls -lh replaymod_src.zip
