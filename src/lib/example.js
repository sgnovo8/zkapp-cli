const chalk = require('chalk');
const degit = require('degit');
const fs = require('fs');
const ora = require('ora');
const sh = require('shelljs');
const util = require('util');
const gittar = require('gittar');

const _green = chalk.green;
const _red = chalk.red;
const shExec = util.promisify(sh.exec);

/**
 * Create a new SNAPP project with recommended dir structure, Prettier config,
 * testing lib, etc. Warns if already exists and does NOT overwrite.
 * @param {string} name  Desired dir name or path. Will recursively create
 *                       dirs without overwriting existing content, if needed.
 * @return {void}
 */
async function example(name) {
  const emitter = degit('github:o1-labs/snapp-cli/templates/project-ts#main', {
    cache: true, // enable to support offline use
    force: false, // throw err if dest is not empty
  });

  emitter.on('err', (err) => {
    console.error(err.message);
    console.error(_red('Error: ' + err.code));
  });

  name = findUniqueDir(name);

  const spinner = ora('Clone project template...').start();

  emitter
    .clone(name)
    .then(async () => {
      spinner.succeed(_green('Clone project template'));

      // Set dir for shell commands. Doesn't change user's dir in their CLI.
      sh.cd(name);

      // Git must be initialized before running `npm install` b/c Husky runs a
      // `prepare` NPM script to set up its pre-commit hook within `.git` during
      // installation. Otherwise Husky will throw an error.
      if (!sh.which('git')) {
        console.error(_red('Please ensure Git is installed, then try again.'));
        return;
      }

      await step('Initialize Git repo', 'git init -q && git branch -m main');

      // `/dev/null` is the only way to silence Husky's install log msg.
      await step('NPM install', 'npm ci --silent > "/dev/null" 2>&1');

      // process.cwd() is full path to user's terminal + path/to/name.
      await setProjectName(process.cwd());

      if (!(await extractExample('sudoku', 'js'))) return;

      // `-n` (no verify) skips Husky's pre-commit hooks.
      await step(
        'Git init commit',
        `git add . && git commit -m 'Init commit' -q -n`
      );

      const str =
        `\nSuccess!\n` +
        `\nNext steps:` +
        `\n  cd ${name}` +
        `\n  git remote add origin <your-repo-url>` +
        `\n  git push -u origin main`;

      console.log(_green(str));
    })
    .catch((err) => {
      spinner.fail('Clone project template');

      if (err.code === 'DEST_NOT_EMPTY') {
        console.error(
          _red('Destination directory is not empty. Not proceeding.')
        );
      } else {
        console.error(err.message);
        console.error(_red('Error: ' + err.code));
      }
    });
}

/**
 * Helper for any steps that need to call a shell command.
 * @param {string} step Name of step to show user
 * @param {string} cmd  Shell command to execute.
 */
async function step(step, cmd) {
  const spin = ora(`${step}...`).start();
  try {
    await shExec(cmd);
    spin.succeed(_green(step));
  } catch (err) {
    spin.fail(step);
  }
}

/**
 * Step to replace placeholder names in the project with the properly-formatted
 * version of the user-supplied name as specified via `snapp project <name>`
 * @param {string} projDir Full path to terminal dir + path/to/name
 */
async function setProjectName(projDir) {
  const step = 'Set project name';
  const spin = ora(`${step}...`).start();

  const name = projDir.split('/').pop();
  replaceInFile(projDir + '/README.md', 'PROJECT_NAME', titleCase(name));
  replaceInFile(projDir + '/package.json', 'package-name', kebabCase(name));

  spin.succeed(_green(step));
}

/**
 * Helper to replace text in a file.
 * @param {string} file Path to file
 * @param {string} a    Old text.
 * @param {string} b    New text.
 */
function replaceInFile(file, a, b) {
  content = fs.readFileSync(file, 'utf8');
  content = content.replace(a, b);
  fs.writeFileSync(file, content);
}

function titleCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase())
    .join(' ');
}

function kebabCase(str) {
  return str.toLowerCase().replace(' ', '-');
}

/**
 * Fetch an example & place in the `src` directory.
 * @param {string} example Name of the example
 * @param {string} lang    ts or js
 * @returns {boolean}      True if successful; false if not.
 */
async function extractExample(example, lang) {
  const step = 'Extract example';
  const spin = ora(`${step}...`).start();

  try {
    const src = 'github:o1-labs/snapp-cli#main';
    await gittar.fetch(src);

    // Note: Extract will overwrite any existing dir's contents. That's ok here.
    const dest = 'TEMP';
    await gittar.extract(src, dest, {
      filter(path) {
        return path.includes(`examples/${example}/${lang}/src`);
      },
    });

    // Example not found. Delete the proj template to clean up.
    if (isEmpty(dest)) {
      spin.fail(step);
      console.error(_red('Example not found'));
      sh.rm('-r', process.cwd());
      return false;
    }

    // Delete proj template's `src` & move the example's `src` into its place.
    sh.rm('-r', 'src');
    sh.mv('' + dest + `/examples/${example}/${lang}/src`, 'src');
    sh.rm('-r', dest);
    spin.succeed(_green(step));
    return true;
  } catch (err) {
    spin.fail(step);
    console.error(err);
    return false;
  }
}

function isEmpty(path) {
  return fs.readdirSync(path).length === 0;
}

/**
 * Given a desired directory name, will return that dir name if it is available,
 * or the next next available dir name with a numeric suffix: <dirName><#>.
 * @param {string} str Desired dir name.
 * @param {number} i   Counter for the recursive function.
 * @return {string}    An unused directory name.
 */
function findUniqueDir(str, i = 0) {
  const dir = str + (i ? i : '');
  if (fs.existsSync(dir)) {
    return findUniqueDir(str, ++i);
  }
  return dir;
}

module.exports = {
  example,
  step,
  setProjectName,
  replaceInFile,
  titleCase,
  kebabCase,
  extractExample,
  isEmpty,
  findUniqueDir,
};