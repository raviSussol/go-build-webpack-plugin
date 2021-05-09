/* eslint-disable no-unused-vars */
'use strict';

import { rmSync, readdirSync, statSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { join, basename } from 'path';

class GoBuildWebpackPlugin {
  constructor(options = {}) {
    if (!Object.prototype.hasOwnProperty.call(options, 'build')) {
      throw new Error('GoBuildWebpackPlugin must have an object argument having a "build" key.');
    }
    if (!Array.isArray(options.build)) {
      throw new Error('Build key argument must be an array type.');
    }
    this.inject = options.inject;
    this.build = options.build;
    this.files = [];
  }

  getFilesRecursively(dir) {
    readdirSync(dir).forEach(file => {
      const abs = join(dir, file);
      if (statSync(abs).isDirectory()) return this.getFilesRecursively(abs);
      return this.files.push(abs);
    });
  }

  toCamelCase(text) {
    return text.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  apply(compiler) {
    compiler.hooks.make.tapAsync('GoBuildWebpackPlugin', (compilation, cb) => {
      if (this.build.length === 0) {
        return cb(new Error(
          'Build key arguments must contain at least one object element with "resourcePath", "outputPath" & "mode" keys set.'
          ));
      }
      if (this.inject === true) {
        this.inject = false;
        this.build.forEach(b => {
          if (!b.resourcePath || !b.outputPath || !b.mode) {
            return cb(new Error('Build key arguments must contain "resourcePath", "outputPath" & "mode".'));
          }
          const goFileRegex = /(?:_test)\.go/g;
          this.getFilesRecursively(b.resourcePath);
          this.files.filter(f => !f.match(goFileRegex)).forEach(srcFile => {
            const destFile = srcFile.replace(`${b.resourcePath}/`, '');
            const fileNameInCamelCase = this.toCamelCase(`lib ${basename(destFile)}`);
            const destLibFile = destFile.replace(basename(destFile), fileNameInCamelCase)
              .replace('.Go', process.platform === 'darwin' ? '.dylib' : '.dll');
            const destHeaderFile = destFile.replace(basename(destFile), fileNameInCamelCase)
              .replace('.Go', '.h');
            const cmd = `go build -o ${b.outputPath}/${destLibFile} -buildmode=${b.mode} ${srcFile}`;
            exec(cmd, (error, stdout, stderr) => {
              if (error) {
                return cb(error, null);
              }
              // Filter header files in the 'dist' folder
              if (existsSync(`${b.outputPath}/${destHeaderFile}`)) {
                rmSync(`${b.outputPath}/${destHeaderFile}`, { recursive: true });
              }
            });
          });
        });
      }
      cb(); // Continue compilation
    });
  }
}

export default GoBuildWebpackPlugin;
