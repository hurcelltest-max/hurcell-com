export interface PhoneCatalogEntry {
  brand: string;
  model: string;
  colors: string[];
  memories: string[];
}

export const phoneCatalog: PhoneCatalogEntry[] = [
  {
    brand: "Samsung",
    model: "Galaxy S24",
    colors: ["Siyah", "Gri", "Sarı", "Menekşe"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy S24+",
    colors: ["Siyah", "Gri", "Sarı", "Menekşe"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    colors: ["Titanyum Siyah", "Titanyum Gri", "Titanyum Sarı"],
    memories: ["256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Xiaomi",
    model: "Redmi Note 13 Pro",
    colors: ["Gece Siyahı", "Kutup Beyazı", "Orman Yeşili"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy A35 5G",
    colors: ["Lacivert", "Buz Mavisi", "Lilac", "Sarı"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy A55 5G",
    colors: ["Lacivert", "Buz Mavisi", "Lilac", "Sarı"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Apple",
    model: "iPhone 16",
    colors: ["Siyah", "Beyaz", "Pembe", "Deniz Yeşili", "Ultramarin"],
    memories: ["128 GB", "256 GB", "512 GB"]
  },
  {
    brand: "Apple",
    model: "iPhone 16 Plus",
    colors: ["Siyah", "Beyaz", "Pembe", "Deniz Yeşili", "Ultramarin"],
    memories: ["128 GB", "256 GB", "512 GB"]
  },
  {
    brand: "Apple",
    model: "iPhone 16 Pro",
    colors: ["Siyah Titanyum", "Beyaz Titanyum", "Doğal Titanyum", "Çöl Titanyumu"],
    memories: ["128 GB", "256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Apple",
    model: "iPhone 16 Pro Max",
    colors: ["Siyah Titanyum", "Beyaz Titanyum", "Doğal Titanyum", "Çöl Titanyumu"],
    memories: ["256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy A06",
    colors: ["Siyah", "Beyaz", "Altın"],
    memories: ["64 GB", "128 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy A16 5G",
    colors: ["Siyah", "Açık Yeşil", "Gri"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Redmi 14C",
    colors: ["Gece Siyahı", "Rüya Moru", "Ada Mavisi"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Apple",
    model: "iPhone 16e",
    colors: ["Siyah", "Beyaz", "Parlak Doğa"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy S25",
    colors: ["Gizemli Siyah", "Gümüş", "Mavi"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy S25+",
    colors: ["Gizemli Siyah", "Gümüş", "Mavi"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy S25 Ultra",
    colors: ["Titanyum Siyah", "Titanyum Gümüş", "Titanyum Safir"],
    memories: ["256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Xiaomi",
    model: "Redmi Note 14 Pro",
    colors: ["Gece Siyahı", "Kristal Beyazı", "Şafak Moru"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Xiaomi 17T",
    colors: ["Kozmik Siyah", "Meteor Grisi", "Alp Mavisi"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Xiaomi 17T Pro",
    colors: ["Kozmik Siyah", "Meteor Grisi", "Titanyum Gümüş"],
    memories: ["512 GB", "1 TB"]
  },
  {
    brand: "Apple",
    model: "iPhone 17",
    colors: ["Siyah", "Beyaz", "Yeşil", "Havacı Mavisi"],
    memories: ["128 GB", "256 GB", "512 GB"]
  },
  {
    brand: "Apple",
    model: "iPhone 17 Pro",
    colors: ["Uzay Siyahı", "Gümüş", "Platin Titanyum"],
    memories: ["256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Apple",
    model: "iPhone 17 Pro Max",
    colors: ["Uzay Siyahı", "Gümüş", "Platin Titanyum"],
    memories: ["256 GB", "512 GB", "1 TB"]
  }
];

export const accessoryBrands = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "Spigen",
  "Baseus",
  "Mcdodo",
  "Anker",
  "Ugreen",
  "Belkin"
];

export const accessoryColors = [
  "Siyah",
  "Beyaz",
  "Şeffaf",
  "Mavi",
  "Kırmızı",
  "Gri",
  "Altın"
];
