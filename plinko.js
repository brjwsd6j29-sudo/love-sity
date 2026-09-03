// ИГРА ПЛИНКО
// Шарик 16 раз "падает" влево/вправо с вероятностью 50/50 на каждом колышке (честный биномиальный процесс,
// в точности как физический плинко-борд). Итоговая лунка и множитель полностью случайны и не подкручиваются.

const ROWS = 16;

// Таблицы множителей по уровню риска (17 лунок, симметрично).
// Средний ожидаемый возврат ~99% (house edge ~1%) на всех уровнях.
const TABLES = {
  low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

function drop(risk = 'medium') {
  const table = TABLES[risk] || TABLES.medium;
  const path = []; // 0 = влево, 1 = вправо, для анимации на фронте
  let rightCount = 0;
  for (let i = 0; i < ROWS; i++) {
    const goRight = Math.random() < 0.5 ? 1 : 0;
    path.push(goRight);
    rightCount += goRight;
  }
  // rightCount (0..16) — индекс лунки, куда попал шарик
  const multiplier = table[rightCount];
  return { path, bucketIndex: rightCount, multiplier, rows: ROWS, risk };
}

module.exports = { drop, TABLES, ROWS };
