// Local test script for finance business rules validation (cents math and installment splits)
console.log("=== RUNNING LOCAL FINANCE V1 MATHEMATICAL BUSINESS RULES TESTS ===");

function splitInstallments(financedTotalCents, count) {
  if (count <= 0) return [];
  const baseAmount = Math.floor(financedTotalCents / count);
  const result = [];
  for (let i = 1; i <= count; i++) {
    const isLast = (i === count);
    const amount = isLast ? (financedTotalCents - (count - 1) * baseAmount) : baseAmount;
    result.push(amount);
  }
  return result;
}

const testCases = [
  {
    name: "1000 TL, 3 taksit (kuruş yuvarlama check)",
    cashPrice: 100000,
    downPayment: 0,
    rate: 0.0,
    count: 3,
    expectedFinanced: 100000,
    expectedSplits: [33333, 33333, 33334]
  },
  {
    name: "1000 TL, 100 TL peşinatlı, 3 taksit",
    cashPrice: 100000,
    downPayment: 10000,
    rate: 0.0,
    count: 3,
    expectedFinanced: 90000,
    expectedSplits: [30000, 30000, 30000]
  },
  {
    name: "1000 TL, peşinatsız %10 vade farklı, 3 taksit",
    cashPrice: 100000,
    downPayment: 0,
    rate: 0.10,
    count: 3,
    expectedFinanced: 110000,
    expectedSplits: [36666, 36666, 36668]
  },
  {
    name: "1000 TL, 2 taksit",
    cashPrice: 100000,
    downPayment: 0,
    rate: 0.0,
    count: 2,
    expectedFinanced: 100000,
    expectedSplits: [50000, 50000]
  }
];

let allPassed = true;

// Min limit check simulation
function checkMinContractAmount(amountCents) {
  return amountCents >= 75000;
}

// Downpayment equal to cash price check simulation
function checkDownPaymentValid(cashPriceCents, downPaymentCents) {
  return downPaymentCents < cashPriceCents;
}

// Run math tests
testCases.forEach(tc => {
  const principal = tc.cashPrice - tc.downPayment;
  const charge = Math.round(principal * tc.rate);
  const totalFinanced = principal + charge;
  
  const splits = splitInstallments(totalFinanced, tc.count);
  const splitsMatch = JSON.stringify(splits) === JSON.stringify(tc.expectedSplits);
  const totalMatch = totalFinanced === tc.expectedFinanced;
  
  const passed = splitsMatch && totalMatch;
  if (!passed) allPassed = false;
  
  console.log(`[${passed ? "PASS" : "FAIL"}] ${tc.name}`);
  console.log(`       Financed Cents: ${totalFinanced} (Expected: ${tc.expectedFinanced})`);
  console.log(`       Splits: [${splits.join(", ")}] (Expected: [${tc.expectedSplits.join(", ")}])`);
});

// Run business rule validations
console.log("\n=== RUNNING BUSINESS RULE VALIDATIONS ===");

const minAmountCheckPass = checkMinContractAmount(75000) === true;
const minAmountCheckFail = checkMinContractAmount(74900) === false;
console.log(`[${minAmountCheckPass && minAmountCheckFail ? "PASS" : "FAIL"}] 750 TL Alt limit kuralı`);

const downPaymentValidPass = checkDownPaymentValid(100000, 20000) === true;
const downPaymentValidFail = checkDownPaymentValid(100000, 100000) === false;
console.log(`[${downPaymentValidPass && downPaymentValidFail ? "PASS" : "FAIL"}] Peşinatın tam bedele eşit olmama kuralı`);

if (allPassed && minAmountCheckPass && minAmountCheckFail && downPaymentValidPass && downPaymentValidFail) {
  console.log("\nALL FINANCE V1 BUSINESS RULES TESTS COMPLETED SUCCESSFULLY!");
} else {
  console.log("\nSOME FINANCE BUSINESS RULES TESTS FAILED!");
  process.exit(1);
}
