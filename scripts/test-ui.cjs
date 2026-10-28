'use strict';
const {spawnSync}=require('node:child_process');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[require('node:path').join(__dirname,process.argv[2]==='print'?'../tests/print-pagination.cjs':'../tests/ui-layout.cjs')],{stdio:'inherit',env});
if(result.error)console.error(result.error.message);process.exit(result.status??1);
