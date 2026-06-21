import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type RoundingType = 'none' | 'tam_tl' | 'yakin_10' | 'sonu_9_90' | 'sonu_99_90';

export function calculateNewPrice(
  basePrice: number,
  actionType: 'markup' | 'margin' | 'flat_increase' | 'flat_decrease' | 'percent_increase' | 'percent_decrease' | 'currency_update',
  value: number,
  rounding: RoundingType,
  exchangeRate: number = 1
): number {
  if (basePrice < 0) throw new Error('Base price cannot be negative.');
  
  let result = new Decimal(basePrice);
  const valDec = new Decimal(value);

  switch (actionType) {
    case 'markup':
      // Base + (Base * value / 100)
      result = result.mul(valDec.div(100).plus(1));
      break;
    case 'margin':
      // Base / (1 - value / 100)
      if (value < 0 || value >= 100) throw new Error('Margin must be 0 <= margin < 100');
      result = result.div(new Decimal(1).minus(valDec.div(100)));
      break;
    case 'flat_increase':
      result = result.plus(valDec);
      break;
    case 'flat_decrease':
      result = result.minus(valDec);
      break;
    case 'percent_increase':
      result = result.mul(valDec.div(100).plus(1));
      break;
    case 'percent_decrease':
      result = result.mul(new Decimal(1).minus(valDec.div(100)));
      break;
    case 'currency_update':
      result = result.mul(new Decimal(exchangeRate));
      break;
    default:
      throw new Error('Unknown action type');
  }

  if (exchangeRate <= 0 || isNaN(exchangeRate)) {
    throw new Error('Exchange rate must be a positive number.');
  }

  if (result.isNegative()) {
    throw new Error('Price calculation resulted in a negative value.');
  }

  // Apply rounding
  return applyRounding(result, rounding);
}

function applyRounding(price: Decimal, rounding: RoundingType): number {
  switch (rounding) {
    case 'tam_tl':
      return price.ceil().toNumber();
    case 'yakin_10':
      return price.div(10).ceil().mul(10).toNumber();
    case 'sonu_9_90':
      // Math.ceil((price - 9.90) / 10) * 10 + 9.90
      const dSub90 = price.minus(9.90);
      const dDiv90 = dSub90.div(10);
      return dDiv90.ceil().mul(10).plus(9.90).toDecimalPlaces(2).toNumber();
    case 'sonu_99_90':
      // Math.ceil((price - 99.90) / 100) * 100 + 99.90
      const dSub99 = price.minus(99.90);
      const dDiv99 = dSub99.div(100);
      return dDiv99.ceil().mul(100).plus(99.90).toDecimalPlaces(2).toNumber();
    case 'none':
    default:
      return price.toDecimalPlaces(2).toNumber();
  }
}

export function validateExchangeRate(rate: any): number {
  if (rate === undefined || rate === null || rate === '') {
    throw new Error('Exchange rate is required.');
  }
  const num = Number(rate);
  if (isNaN(num) || num <= 0) {
    throw new Error('Exchange rate must be a positive number.');
  }
  return num;
}

export function validateForeignBuyPrice(price: any): number {
  if (price === undefined || price === null || price === '') {
    throw new Error('Foreign buy price is missing.');
  }
  const num = Number(price);
  if (isNaN(num) || num <= 0) {
    throw new Error('Foreign buy price must be positive.');
  }
  return num;
}

export function calculateKeepRatioPrice(
  buyPrice: number,
  sellPrice: number,
  newBuyPrice: number,
  rounding: RoundingType
): number {
  if (buyPrice <= 0) {
    return calculateNewPrice(newBuyPrice, 'flat_increase', 0, rounding);
  }
  const ratio = new Decimal(sellPrice).div(new Decimal(buyPrice));
  const result = new Decimal(newBuyPrice).mul(ratio);
  return applyRounding(result, rounding);
}


