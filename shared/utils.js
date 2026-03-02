// shared/utils.js — Shared utilities for URL Blocker

/**
 * Compute SHA-256 hash of a string.
 * @param {string} str
 * @returns {Promise<string>} hex-encoded hash
 */
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a math problem appropriate to the given difficulty.
 * @param {"easy"|"medium"|"hard"} difficulty
 * @returns {{ question: string, answer: number }}
 */
function generateMathProblem(difficulty) {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  switch (difficulty) {
    case "easy": {
      // Single-digit multiplication OR 2-digit addition
      if (Math.random() < 0.5) {
        const a = rand(2, 9);
        const b = rand(2, 9);
        return { question: `${a} × ${b} = ?`, answer: a * b };
      } else {
        const a = rand(10, 49);
        const b = rand(10, 49);
        return { question: `${a} + ${b} = ?`, answer: a + b };
      }
    }

    case "medium": {
      // 2-digit × 1-digit OR 3-digit subtraction
      if (Math.random() < 0.5) {
        const a = rand(11, 99);
        const b = rand(3, 9);
        return { question: `${a} × ${b} = ?`, answer: a * b };
      } else {
        const a = rand(200, 999);
        const b = rand(50, a - 50);
        return { question: `${a} − ${b} = ?`, answer: a - b };
      }
    }

    case "hard": {
      // 2-digit × 2-digit OR 4-digit addition
      if (Math.random() < 0.5) {
        const a = rand(12, 99);
        const b = rand(12, 99);
        return { question: `${a} × ${b} = ?`, answer: a * b };
      } else {
        const a = rand(1000, 4999);
        const b = rand(1000, 4999);
        return { question: `${a} + ${b} = ?`, answer: a + b };
      }
    }

    default:
      return generateMathProblem("easy");
  }
}
