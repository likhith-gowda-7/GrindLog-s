import chalk from 'chalk';

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  sync: '🔄',
  rocket: '🚀',
  star: '⭐',
  fire: '🔥',
  brain: '🧠',
  folder: '📁',
  file: '📄',
  git: '📦',
  clock: '⏱️',
  check: '✓',
  cross: '✗',
  arrow: '→',
  dot: '•',
};

class Logger {
  static success(msg) {
    console.log(chalk.green(`${ICONS.success} ${msg}`));
  }

  static error(msg) {
    console.log(chalk.red(`${ICONS.error} ${msg}`));
  }

  static warn(msg) {
    console.log(chalk.yellow(`${ICONS.warning} ${msg}`));
  }

  static info(msg) {
    console.log(chalk.blue(`${ICONS.info} ${msg}`));
  }

  static sync(msg) {
    console.log(chalk.cyan(`${ICONS.sync} ${msg}`));
  }

  static step(num, total, msg) {
    console.log(chalk.dim(`  [${num}/${total}]`) + ` ${msg}`);
  }

  static progress(current, total, label = '') {
    const pct = Math.round((current / total) * 100);
    const filled = Math.round(pct / 2.5);
    const empty = 40 - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    process.stdout.write(`\r  ${bar} ${chalk.bold(`${pct}%`)} ${chalk.dim(`(${current}/${total})`)} ${label}`);
    if (current === total) process.stdout.write('\n');
  }

  static header(title) {
    const line = chalk.dim('─'.repeat(50));
    console.log('');
    console.log(line);
    console.log(chalk.bold.cyan(`  ${ICONS.rocket} ${title}`));
    console.log(line);
    console.log('');
  }

  static table(data) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const widths = keys.map(k =>
      Math.max(k.length, ...data.map(row => String(row[k]).length))
    );

    const headerRow = keys.map((k, i) => chalk.bold(k.padEnd(widths[i]))).join('  ');
    const separator = widths.map(w => chalk.dim('─'.repeat(w))).join('──');

    console.log(`  ${headerRow}`);
    console.log(`  ${separator}`);
    data.forEach(row => {
      const rowStr = keys.map((k, i) => String(row[k]).padEnd(widths[i])).join('  ');
      console.log(`  ${rowStr}`);
    });
  }

  static stats(label, value, color = 'white') {
    console.log(`  ${chalk.dim(ICONS.dot)} ${chalk.dim(label + ':')} ${chalk[color](value)}`);
  }

  static blank() {
    console.log('');
  }
}

export { Logger, ICONS };
