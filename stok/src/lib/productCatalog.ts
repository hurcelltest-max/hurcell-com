export interface PhoneCatalogEntry {
  brand: string;
  model: string;
  colors: string[];
  memories: string[];
}

export interface LaptopCatalogEntry {
  brand: string;
  model: string;
  colors: string[];
  ramOptions: string[];
  storageOptions: string[];
}

export interface SmartwatchCatalogEntry {
  brand: string;
  model: string;
  colors: string[];
  memories: string[]; // opsiyonel
}

// ─── Telefon Kataloğu ──────────────────────────────────────────────────────────
export const phoneCatalog: PhoneCatalogEntry[] = [
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
    brand: "Apple",
    model: "iPhone 16e",
    colors: ["Siyah", "Beyaz", "Parlak Doğa"],
    memories: ["128 GB", "256 GB"]
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
  },
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
    brand: "Xiaomi",
    model: "Redmi Note 13 Pro",
    colors: ["Gece Siyahı", "Kutup Beyazı", "Orman Yeşili"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Redmi Note 14 Pro",
    colors: ["Gece Siyahı", "Kristal Beyazı", "Şafak Moru"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Redmi 14C",
    colors: ["Gece Siyahı", "Rüya Moru", "Ada Mavisi"],
    memories: ["128 GB", "256 GB"]
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
  }
];

// ─── Tablet Kataloğu ───────────────────────────────────────────────────────────
export const tabletCatalog: PhoneCatalogEntry[] = [
  {
    brand: "Apple",
    model: "iPad (10. Nesil)",
    colors: ["Gümüş", "Uzay Grisi", "Mavi", "Pembe", "Sarı"],
    memories: ["64 GB", "256 GB"]
  },
  {
    brand: "Apple",
    model: "iPad Air (M2)",
    colors: ["Uzay Grisi", "Yıldız Işığı", "Mavi", "Mor"],
    memories: ["128 GB", "256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Apple",
    model: "iPad Pro 11\" (M4)",
    colors: ["Uzay Siyahı", "Gümüş"],
    memories: ["256 GB", "512 GB", "1 TB", "2 TB"]
  },
  {
    brand: "Apple",
    model: "iPad Pro 13\" (M4)",
    colors: ["Uzay Siyahı", "Gümüş"],
    memories: ["256 GB", "512 GB", "1 TB", "2 TB"]
  },
  {
    brand: "Apple",
    model: "iPad mini (A17 Pro)",
    colors: ["Uzay Grisi", "Yıldız Işığı", "Mavi", "Mor"],
    memories: ["128 GB", "256 GB", "512 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy Tab S9",
    colors: ["Grafite", "Krem"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy Tab S9+",
    colors: ["Grafite", "Krem"],
    memories: ["256 GB", "512 GB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy Tab S9 Ultra",
    colors: ["Grafite", "Krem"],
    memories: ["256 GB", "512 GB", "1 TB"]
  },
  {
    brand: "Samsung",
    model: "Galaxy Tab A9+",
    colors: ["Grafite", "Gümüş", "Lacivert"],
    memories: ["64 GB", "128 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Xiaomi Pad 7",
    colors: ["Siyah", "Gümüş", "Mor"],
    memories: ["128 GB", "256 GB"]
  },
  {
    brand: "Xiaomi",
    model: "Xiaomi Pad 7 Pro",
    colors: ["Siyah", "Altın"],
    memories: ["256 GB", "512 GB"]
  }
];

// ─── Bilgisayar Kataloğu ───────────────────────────────────────────────────────
export const laptopCatalog: LaptopCatalogEntry[] = [
  {
    brand: "Apple",
    model: "MacBook Air 13\" (M3)",
    colors: ["Uzay Grisi", "Gümüş", "Gece Yarısı", "Yıldız Işığı"],
    ramOptions: ["8 GB", "16 GB", "24 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Apple",
    model: "MacBook Air 15\" (M3)",
    colors: ["Uzay Grisi", "Gümüş", "Gece Yarısı", "Yıldız Işığı"],
    ramOptions: ["8 GB", "16 GB", "24 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Apple",
    model: "MacBook Pro 14\" (M4)",
    colors: ["Uzay Siyahı", "Gümüş"],
    ramOptions: ["16 GB", "24 GB", "32 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Apple",
    model: "MacBook Pro 16\" (M4)",
    colors: ["Uzay Siyahı", "Gümüş"],
    ramOptions: ["24 GB", "32 GB", "48 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD", "2 TB SSD", "4 TB SSD"]
  },
  {
    brand: "Samsung",
    model: "Galaxy Book4 Pro",
    colors:["Moonstone Gray", "Sapphire Blue"],
    ramOptions: ["16 GB", "32 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD"]
  },
  {
    brand: "Dell",
    model: "XPS 13",
    colors: ["Gümüş", "Siyah", "Altın"],
    ramOptions: ["16 GB", "32 GB", "64 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Dell",
    model: "XPS 15",
    colors: ["Gümüş", "Siyah"],
    ramOptions: ["16 GB", "32 GB", "64 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Lenovo",
    model: "ThinkPad X1 Carbon",
    colors: ["Siyah"],
    ramOptions: ["16 GB", "32 GB", "64 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Lenovo",
    model: "IdeaPad 5 Pro",
    colors: ["Bulut Grisi", "Okyanus Mavi"],
    ramOptions: ["8 GB", "16 GB", "32 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD"]
  },
  {
    brand: "Asus",
    model: "ZenBook 14",
    colors: ["Jasper Kırmızı", "Aqua Mavi", "Pebble Gri"],
    ramOptions: ["8 GB", "16 GB", "32 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD"]
  },
  {
    brand: "HP",
    model: "Spectre x360 14",
    colors: ["Nightfall Black", "Natural Silver"],
    ramOptions: ["16 GB", "32 GB"],
    storageOptions: ["512 GB SSD", "1 TB SSD", "2 TB SSD"]
  },
  {
    brand: "Microsoft",
    model: "Surface Laptop 5",
    colors: ["Sandstone", "Matte Black", "Gümüş", "Adaçayı"],
    ramOptions: ["8 GB", "16 GB", "32 GB"],
    storageOptions: ["256 GB SSD", "512 GB SSD", "1 TB SSD"]
  }
];

// ─── Akıllı Saat Kataloğu ─────────────────────────────────────────────────────
export const smartwatchCatalog: SmartwatchCatalogEntry[] = [
  {
    brand: "Apple",
    model: "Apple Watch Series 10",
    colors: ["Siyah", "Gümüş", "Rose Gold", "Natural Titanyum"],
    memories: []
  },
  {
    brand: "Apple",
    model: "Apple Watch Ultra 2",
    colors: ["Natural Titanyum", "Siyah Titanyum"],
    memories: []
  },
  {
    brand: "Apple",
    model: "Apple Watch SE (2. Nesil)",
    colors: ["Gece Yarısı", "Yıldız Işığı", "Gümüş"],
    memories: []
  },
  {
    brand: "Samsung",
    model: "Galaxy Watch 7",
    colors: ["Yeşil", "Krem", "Gümüş"],
    memories: []
  },
  {
    brand: "Samsung",
    model: "Galaxy Watch Ultra",
    colors: ["Beyaz", "Titanyum Siyah", "Titanyum Gümüş"],
    memories: []
  },
  {
    brand: "Samsung",
    model: "Galaxy Watch FE",
    colors: ["Siyah", "Pembe Altın", "Gümüş"],
    memories: []
  },
  {
    brand: "Xiaomi",
    model: "Redmi Watch 5",
    colors: ["Siyah", "Gümüş", "Mavi"],
    memories: []
  },
  {
    brand: "Xiaomi",
    model: "Xiaomi Smart Band 9",
    colors: ["Obsidian", "Gold", "Midnight Blue"],
    memories: []
  },
  {
    brand: "Garmin",
    model: "Garmin Fenix 8",
    colors: ["Siyah", "Gümüş", "Altın", "Titanyum"],
    memories: []
  },
  {
    brand: "Huawei",
    model: "Huawei Watch GT 5",
    colors: ["Siyah", "Gümüş", "Altın", "Kahverengi"],
    memories: []
  }
];

// ─── Aksesuar Markaları & Renkleri ────────────────────────────────────────────
export const accessoryBrands = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "Spigen",
  "Baseus",
  "Mcdodo",
  "Anker",
  "Ugreen",
  "Belkin",
  "ESR",
  "RhinoShield",
  "Torras"
];

export const accessoryColors = [
  "Siyah",
  "Beyaz",
  "Şeffaf",
  "Mavi",
  "Kırmızı",
  "Gri",
  "Altın",
  "Pembe",
  "Yeşil",
  "Mor",
  "Lacivert"
];
