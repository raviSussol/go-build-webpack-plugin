/* eslint-disable no-unused-vars */
'use strict';

import {
  rmSync,
  readdirSync,
  statSync,
  existsSync,
  lstatSync
} from 'fs';
import { platform } from 'process';
import { exec } from 'child_process';
import { join, basename, resolve } from 'path';
import { validate } from 'schema-utils';
import schema from './schema.json';

/**
 * Build go libraries with different build modes supported
 * as well as build go project and serves in the webpack
 * bundle.
 */
class GoBuildWebpackPlugin {
  constructor(options = {}) {
    validate(schema, options, {
      name: 'Go Build Plugin',
      baseDataPath: 'options'
    });
    this.inject = options.inject;
    this.build = options.build;
  }
  static files = [];

  /**
   * Takes file or folder as an input path and returns all
   * file paths from a folder (if an input path is a folder).
   * Otherwise, returns a single file path.
   * @param {string} resourcePath Path of the file or folder to
   * get one or more of their files path.
   * @returns {array} Returns all file paths from a folder (if an input
   * path is a folder). Otherwise, returns a single file path.
   */
  static getFilesRecursively(resourcePath) {
    if (existsSync(resourcePath) && lstatSync(resourcePath).isDirectory()) {
      readdirSync(resourcePath).forEach(file => {
        const abs = join(resourcePath, file);
        if (statSync(abs).isDirectory()) return GoBuildWebpackPlugin.getFilesRecursively(abs);
        return this.files.push(abs);
      });
    } else {
      return this.files.push(resourcePath);
    }
  }

  /**
   * Takes an input string and converts it into a camelCase string.
   * @param {string} text A string to convert to a camelCase string.
   * @returns {string} Returns a camelCase string.
   */
  static toCamelCase(text) {
    return text.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  /**
   * Instantiates plugin as an object on their prototype. It is called
   * once by the webpack compiler while installing the plugin.
   * @param {*} compiler Webpack compiler
   */
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
          let cmd = '';
          if (b.mode === 'ignore') {
            // Do a normal build
            cmd = `go build -o ${b.outputPath} ${b.resourcePath}`; // Can be a go file or a package
            exec(cmd, { cwd: b.cwd || '' }, (error, stdout, stderr) => {
              if (error) {
                return cb(error, null);
              }
            });
          } else {
            const goFileRegex = /(?:_test)\.go/g;
            let pathSeparator = '';
            let extension = '';
            switch (platform) {
              case 'darwin': {
                pathSeparator = '/';
                extension = '.dylib';
                break;
              }
              case 'linux': {
                pathSeparator = '/';
                extension = '.so';
                break;
              }
              default: { // win32
                pathSeparator = '\\';
                extension = '.dll';
                break;
              }
            }
            GoBuildWebpackPlugin.getFilesRecursively(b.resourcePath);
            GoBuildWebpackPlugin.files.filter(f => !f.match(goFileRegex)).forEach(srcFile => {
              let destFile = srcFile.replace(`${resolve(srcFile, '..', '..')}${pathSeparator}`, '');
              if (existsSync(b.resourcePath) && lstatSync(b.resourcePath).isDirectory()) {
                destFile = srcFile.replace(`${b.resourcePath}${pathSeparator}`, '');
              }
              const fileNameInCamelCase = GoBuildWebpackPlugin.toCamelCase(`lib ${basename(destFile)}`);
              const destLibFile = destFile.replace(basename(destFile), fileNameInCamelCase)
                .replace('.Go', extension);
              const destHeaderFile = destFile.replace(basename(destFile), fileNameInCamelCase)
                .replace('.Go', '.h');
              cmd = `go build -o ${b.outputPath}${pathSeparator}${destLibFile} -buildmode=${b.mode} ${srcFile}`;
              exec(cmd, { cwd: b.cwd || '' }, (error, stdout, stderr) => {
                if (error) {
                  return cb(error, null);
                }
                // Filter header files in the 'dist' folder
                if (existsSync(`${b.outputPath}${pathSeparator}${destHeaderFile}`)) {
                  rmSync(`${b.outputPath}${pathSeparator}${destHeaderFile}`, { recursive: true });
                }
              });
            });
          }
        });
      }
      cb(); // Continue compilation
    });
  }
}

export default GoBuildWebpackPlugin;
