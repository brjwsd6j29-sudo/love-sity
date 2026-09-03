// ИГРА МОНЕТКА (орёл / решка)
// 50/50 честный подброс. При выигрыше — x1.92 (обычный для таких игр edge ~4%),
// результат не зависит от выбора игрока и генерируется отдельно от ставки.

const WIN_MULTIPLIER = 1.92;

function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

// choice: 'heads' | 'tails'
function play(choice) {
  const result = flipCoin();
  const win = result === choice;
  return { result, win, multiplier: win ? WIN_MULTIPLIER : 0 };
}

module.exports = { play, WIN_MULTIPLIER };
