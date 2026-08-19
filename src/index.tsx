#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {App} from './app.js';
import {synchronized} from './utils/synchronized.js';

render(<App />, {stdout: synchronized(process.stdout)});
