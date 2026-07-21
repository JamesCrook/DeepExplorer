
// #zoomyruler/code
const LineMarkings = (function() {
  const decimalFactors = [2000000, 1000000, 500000, 100000, 20000, 10000,
    5000, 1000, 200, 100, 50, 10, 2, 1, 0
  ];
  const temporalFactors = [60, 15, 5];

  /**
   * @function formatNumber
   * @description Formats a number with metric prefixes.
   * @param {number} num - The number to format.
   * @returns {string} The formatted number.
   */
  function formatNumber(num) {
    const units = ['', 'k', 'M', 'B', 'T'];
    let i = (num == 0) ? 0 : Math.floor(Math.log10(Math.abs(num)) / 3);
    i = Math.max(0, i);
    const scaled = num / Math.pow(1000, i);
    return parseFloat(scaled.toPrecision(4)) + (units[i] || '');
  }

  /**
   * @function lineStrengths
   * @description Determine the axis lines to draw and their strengths.
   * @param {number[]} factors - A list of spacings for different kinds of marks
   * @param {number} max - The max value to represent, e.g. 179000.
   * @returns {{steps: number[], strength: number}} An object containing the spacing and strength.
   * it defines what marks to draw and how strongly.
   * 
   * The idea is that if you 'want to plot 179000 marks', some of them are too minor to matter, 
   * and you should skip them.
   *
   * This function returns three spacings, for example if it returns:
   *   { steps: [ 5000, 1000, 200 ], strength:  0.3 }
   * This means every 5000 marks is a major mark,
   * every 1000 marks is a weak mark
   * every 200 marks is an 'upcoming' mark of strength 0.3
   * 
   * The idea is that upcoming marks can fade in. 
   * Simple code to use this feature ignores strength and only plots the major and minor marks. It
   * increments the count by steps[1] each time.
   * Advanced code to use this feature plots the major marks, morphs the minor marks to major, 
   * based on strength, and plots the upcoming marks typically with opacity depending on strength.
   * It increments the counts by steps[2] each time.
   */
  function lineStrengths(factors, max) {
    max = Math.max(1, max);
    let ix = 0;
    while(max < factors[ix + 2])
      ix++;
    const spacings = [factors[ix], factors[ix + 1], factors[ix + 2]];
    // v=0 when max==item+2
    // v=1 when max==item
    let v = (max - factors[ix + 2]) / (factors[ix + 1] - factors[ix + 2]);
    return {
      'steps': spacings,
      'strength': v
    };
  }

  // Distinguishes major markers from minor ones
  function isStrongMark(i, strengths) {
    return (i * strengths.steps[2]) % strengths.steps[1] === 0;
  }

  return {
    formatNumber,
    lineStrengths,
    decimalFactors,
    isStrongMark,
    temporalFactors
  };
})();

// Auto-generated exports
if (typeof window !== 'undefined') window.LineMarkings = LineMarkings;
export { LineMarkings };
