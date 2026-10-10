// Household food planner content: dishes the cook already makes (built from the
// cook chat history), add-ons, pantry. Names of people live on the device only.
//
// Dish fields
//   hi     how the cook should read it (Hinglish)
//   meal   which meals it suits
//   diet   veg | egg | nonveg
//   kind   sabzi | gravy | legume | dry | onedish | rice  (drives tweaks + pairing)
//   link   recipe video the cook should follow
//   tips   extra cook instructions (go in message 2)
//   ing    grocery items it needs (see GROCERY)
//   add    default add-ons: b = bread, n = count, dal, rice, rq = rice qty, salad
//   me     my plate of the main, before add-ons: kcal / protein g
//   soak   pulses to soak the night before
//   left   usually leaves leftovers (good to plan a non-veg dinner after it)
//   pair   non-veg only: default veg plan for the partner (split | dalchawal | biryani | patty)
const DISHES = {
  // ---------- veg lunches (sabzi + dal + roti) ----------
  bhindi_aloo: { name: "Bhindi aloo pyaaz", hi: "bhindi aloo pyaaz ki sabji (fridge ki saari bhindi use kar lena)", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["bhindi", "aloo", "kanda"], add: { b: "roti", n: 5, dal: "lasan" }, me: { kcal: 180, p: 4 } },
  lauki: { name: "Lauki / doodhi sabji", hi: "lauki (doodhi) ki sabji", meal: ["lunch", "dinner"], diet: "veg", kind: "sabzi", ing: ["doodhi", "tamatar"], add: { b: "masala", n: 4, dal: "lasan" }, me: { kcal: 120, p: 3 } },
  palak_aloo: { name: "Palak aloo kanda", hi: "palak aloo kanda ki sabji", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["palak", "aloo", "kanda"], add: { b: "", n: 0, dal: "lasan", rice: "plain", rq: 2 }, me: { kcal: 160, p: 5 } },
  aloo_kanda: { name: "Aloo kanda sabji", hi: "aloo kanda ki sabji", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["aloo", "kanda"], add: { b: "", n: 0, dal: "lasan", rice: "plain", rq: 2 }, me: { kcal: 200, p: 4 } },
  gobi_aloo: { name: "Gobi aloo", hi: "gobi aloo ki sabji (saara gobi use kar lena)", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["gobi", "aloo", "tamatar"], add: { b: "roti", n: 5, dal: "plain" }, me: { kcal: 170, p: 5 } },
  pattagobi_aloo: { name: "Patta gobi aloo kanda", hi: "patta gobi aloo kanda ki sabji", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["patta gobi", "aloo", "kanda"], add: { b: "roti", n: 5, dal: "kanda" }, me: { kcal: 160, p: 4 } },
  aloo_capsicum: { name: "Aloo capsicum", hi: "aloo capsicum ki sabji", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["aloo", "capsicum"], add: { b: "roti", n: 4, dal: "plain" }, me: { kcal: 180, p: 4 } },
  parval_aloo: { name: "Parval aloo mixed veg", hi: "parval aloo ki mixed sabji", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["parval", "aloo"], add: { b: "roti", n: 4, dal: "lasan" }, me: { kcal: 160, p: 4 } },
  mushroom_sabzi: { name: "Mushroom sabji", hi: "mushroom ki sabji", meal: ["lunch", "dinner"], diet: "veg", kind: "sabzi", ing: ["mushroom", "kanda", "tamatar"], add: { b: "roti", n: 4, dal: "lasan" }, me: { kcal: 140, p: 6 } },
  baingan_bharta: { name: "Baingan bharta", hi: "baingan ka bharta (pura baingan)", meal: ["lunch"], diet: "veg", kind: "sabzi", ing: ["baingan", "kanda", "tamatar"], add: { b: "roti", n: 4, dal: "plain" }, me: { kcal: 150, p: 4 } },
  mixveg_gravy: { name: "Mixed veg gravy", hi: "mixed vegetable ki gravy, koi naya style", meal: ["lunch"], diet: "veg", kind: "gravy", ing: ["gobi", "gajar", "matar", "capsicum", "tamatar", "kanda"], add: { b: "paratha", n: 4 }, me: { kcal: 200, p: 5 } },
  dum_aloo: { name: "Dum aloo", hi: "dum aloo, video jaisa", meal: ["lunch"], diet: "veg", kind: "gravy", link: "https://youtube.com/shorts/FmzbUxcFTCk", tips: ["Tel kam aur teekha kam rakhna"], ing: ["baby aloo", "dahi", "tamatar"], add: { b: "maida", n: 5 }, me: { kcal: 260, p: 5 } },
  lauki_kofta: { name: "Lauki kofta", hi: "lauki kofta, video jaisa", meal: ["lunch"], diet: "veg", kind: "gravy", link: "https://youtube.com/shorts/0e5kZgPlT20", tips: ["Achhe se banana, 2 log ke liye"], ing: ["doodhi", "besan", "tamatar", "kanda"], add: { b: "paratha", n: 5 }, me: { kcal: 280, p: 7 } },

  // ---------- paneer ----------
  paneer_bhurji: { name: "Paneer bhurji", hi: "paneer bhurji (pura 200 g paneer)", meal: ["lunch", "dinner"], diet: "veg", kind: "sabzi", ing: ["paneer", "kanda", "tamatar", "capsicum"], add: { b: "paratha", n: 4, dal: "lasan" }, me: { kcal: 320, p: 19 } },
  paneer_gravy: { name: "Paneer gravy (different)", hi: "paneer ki gravy, thodi different, meethi mat karna (pura 200 g paneer)", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", ing: ["paneer", "tamatar", "kanda"], add: { b: "paratha", n: 3, dal: "lasan" }, me: { kcal: 340, p: 19 } },
  paneer_red: { name: "Paneer red gravy", hi: "paneer ki red gravy, tamatar wali (pura 200 g paneer)", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", ing: ["paneer", "tamatar", "kanda"], add: { b: "paratha", n: 3 }, me: { kcal: 340, p: 19 } },
  paneer_capsicum: { name: "Paneer capsicum special", hi: "paneer capsicum ki koi special gravy", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", ing: ["paneer", "capsicum", "tamatar", "kanda"], add: { b: "paratha", n: 3, rice: "jeera", rq: 1 }, me: { kcal: 340, p: 19 } },
  shahi_paneer: { name: "Shahi paneer", hi: "shahi paneer, video jaisa", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", link: "https://youtube.com/shorts/YqvE4WWxAuc", tips: ["Kaju badam mat daalna", "Pura paneer use kar lena"], ing: ["paneer", "cream", "kanda", "tamatar"], add: { b: "paratha", n: 3, rice: "jeera", rq: 1 }, me: { kcal: 420, p: 19 } },
  lasooni_palak_paneer: { name: "Lasooni palak paneer", hi: "lasooni palak paneer, video jaisa", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", link: "https://youtu.be/iRG6GSn8xOo", tips: ["Paneer daalne se pehle thoda roast kar lena"], ing: ["paneer", "palak", "lasan"], add: { b: "paratha", n: 4 }, me: { kcal: 330, p: 20 } },
  paneer_butter_masala: { name: "Paneer butter masala", hi: "paneer kanda butter masala, video jaisa", meal: ["lunch", "dinner"], diet: "veg", kind: "gravy", link: "https://youtube.com/shorts/3ARWi3v_9wA", tips: ["Kaju badam mat daalna", "Butter thoda kam"], ing: ["paneer", "butter", "cream", "tamatar", "kanda"], add: { b: "maida", n: 4, dal: "plain" }, me: { kcal: 430, p: 19 } },
  paneer_thecha: { name: "Paneer thecha", hi: "paneer thecha", meal: ["lunch", "dinner"], diet: "veg", kind: "dry", ing: ["paneer", "mirch", "lasan"], add: { b: "roti", n: 4, dal: "plain" }, me: { kcal: 320, p: 19 } },
  palak_paneer_corn: { name: "Palak paneer + palak corn", hi: "palak paneer alag se, aur palak corn alag se (MIX mat karna)", meal: ["lunch"], diet: "veg", kind: "gravy", ing: ["paneer", "palak", "corn"], add: { b: "roti", n: 4 }, me: { kcal: 320, p: 18 } },

  // ---------- pulses (soak the night before) ----------
  chhole: { name: "Chhole", hi: "chhole (raat ko bhigoye hai)", meal: ["lunch"], diet: "veg", kind: "legume", soak: "chhole", tips: ["Spicy mat banana, zyaada watery bhi nahi"], ing: ["chhole", "tamatar", "kanda"], add: { b: "paratha", n: 4, salad: "lachha" }, me: { kcal: 300, p: 12 } },
  kala_chana: { name: "Kala chana (lipte hue)", hi: "kaale chane, video jaisa", meal: ["lunch"], diet: "veg", kind: "legume", soak: "kaale chane", link: "https://youtube.com/shorts/H36kTWp3iOs", tips: ["Spicy mat banana, zyaada watery bhi nahi"], ing: ["kala chana", "kanda", "tamatar"], add: { b: "roti", n: 5 }, me: { kcal: 260, p: 13 } },
  rajma: { name: "Rajma chawal", hi: "rajma ki gravy (raat ko bhigoya hai)", meal: ["lunch"], diet: "veg", kind: "legume", soak: "rajma (aadhi katori)", ing: ["rajma", "tamatar", "kanda"], add: { b: "", n: 0, rice: "plain", rq: 2 }, me: { kcal: 280, p: 13 } },
  palak_dal: { name: "Palak dal + rice", hi: "palak wali daal", meal: ["lunch"], diet: "veg", kind: "legume", ing: ["palak", "toor dal"], add: { b: "roti", n: 3, rice: "jeera", rq: 2 }, me: { kcal: 220, p: 11 } },
  dal_jeera: { name: "Dal tadka + jeera rice", hi: "daal tadka", meal: ["lunch", "dinner"], diet: "veg", kind: "legume", ing: ["toor dal"], add: { b: "", n: 0, rice: "jeera", rq: 2, salad: "kakdi" }, me: { kcal: 200, p: 10 } },
  kadhi_biryani: { name: "Kadhi + veg biryani", hi: "vegetable masala biryani aur kadhi (kadhi video jaisi)", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/ibKdUl8LmB8", ing: ["dahi", "besan", "gajar", "matar", "aloo"], add: { b: "", n: 0 }, me: { kcal: 550, p: 14 }, left: true },

  // ---------- eggs (both eat) ----------
  egg_curry: { name: "Egg curry", hi: "egg curry (6 ande, 2 log ke liye)", meal: ["lunch", "dinner"], diet: "egg", kind: "gravy", ing: ["eggs", "tamatar", "kanda"], add: { b: "paratha", n: 3, rice: "plain", rq: 1 }, me: { kcal: 300, p: 19 } },

  // ---------- one-dish veg dinners (often leave leftovers) ----------
  aloo_paratha: { name: "Aloo kanda paratha", hi: "aloo kanda ke stuffed paratha (6)", meal: ["dinner", "lunch"], diet: "veg", kind: "onedish", tips: ["Aloo achhe se ubaalna", "Filling achhe se bharna"], ing: ["aloo", "kanda", "dahi"], add: { b: "", n: 0, salad: "kakdi" }, me: { kcal: 480, p: 11 } },
  twisted_paratha: { name: "Twisted aloo paratha", hi: "aloo paratha, video wala different style (10 chhote pieces)", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/TD-c7yRkEWI", tips: ["Filling achhe se karna", "Zyaada bade mat banana"], ing: ["aloo", "kanda", "dahi"], add: { b: "", n: 0 }, me: { kcal: 480, p: 11 } },
  besan_chilla: { name: "Paneer besan chilla", hi: "paneer besan chilla, video jaisa (6 pieces)", meal: ["dinner", "lunch"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/ocFaPF0RyrM", tips: ["Andar paneer, gajar, kanda, tamatar, spring onion daal dena", "Saath mai green chutney"], ing: ["besan", "paneer", "gajar", "kanda", "tamatar", "spring onion", "dhaniya"], add: { b: "", n: 0 }, me: { kcal: 380, p: 20 } },
  veg_pancakes: { name: "Mixed veg besan pancakes", hi: "mixed vegetable besan pancakes, video jaisa", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/InYYYotjIXM", ing: ["besan", "gajar", "capsicum", "kanda", "patta gobi"], add: { b: "", n: 0 }, me: { kcal: 350, p: 14 } },
  quesadilla: { name: "Veg quesadilla", hi: "veg quesadilla, video jaisa (8-9 pieces)", meal: ["dinner", "lunch"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/O9CiySE_SOA", tips: ["Andar capsicum, broccoli, babycorn, tamatar, kanda", "Cheese slice daal dena"], ing: ["capsicum", "broccoli", "babycorn", "tamatar", "kanda", "cheese slices", "maida"], add: { b: "", n: 0 }, me: { kcal: 520, p: 18 }, left: true, extras: ["Salsa / nachos"] },
  pav_bhaji: { name: "Pav bhaji", hi: "pav bhaji ki bhaji, bahaut saari (pav hum dekh lenge)", meal: ["dinner", "lunch"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/0dz9yDq_LdI", tips: ["Fridge ki capsicum, corn, tamatar, aloo, kanda, broccoli use kar lena"], ing: ["aloo", "tamatar", "kanda", "capsicum", "matar", "gobi", "butter", "pav", "pav bhaji masala"], add: { b: "", n: 0 }, me: { kcal: 550, p: 12 }, left: true },
  veg_burger: { name: "Veg patty burgers", hi: "veg patties, video jaisi (aloo aur paneer bhi daalna)", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/GIoPkffX87k", tips: ["Patty mai spring onion, gajar, zucchini, paneer, aloo, thoda adrak lasan", "Green chutney: lasan, adrak, dhaniya, pudina, nimbu (video: https://youtube.com/shorts/xS-JS2tqfAk)", "Burger ke liye 2 tamatar slice"], ing: ["aloo", "paneer", "gajar", "zucchini", "spring onion", "buns", "dhaniya", "pudina"], add: { b: "", n: 0 }, me: { kcal: 520, p: 18 }, left: true, extras: ["Frozen fries", "Frozen chicken patties (for me)"] },
  risotto: { name: "Mushroom risotto", hi: "mushroom risotto rice, video jaisa, thoda creamy (2 log ke liye)", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/WMQhwzofZ8E", ing: ["mushroom", "cream", "cheese cubes", "kanda", "lasan"], add: { b: "", n: 0 }, me: { kcal: 500, p: 13 } },
  broccoli_herb_rice: { name: "Creamy broccoli + herb rice", hi: "cheesy creamy masala broccoli, video jaisa", meal: ["lunch", "dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/2ot2nHuZU6w", tips: ["Pura broccoli use kar lena", "2 cheese cubes", "Herb rice 2 log jitna", "Teekha ekdum kam", "Oregano aur chilli flakes thoda"], ing: ["broccoli", "cheese cubes", "cream", "capsicum", "mushroom"], add: { b: "", n: 0 }, me: { kcal: 480, p: 15 } },
  coconut_herb_rice: { name: "Coconut veg curry + herb rice", hi: "coconut curry (vegetables wali) aur herb vegetable rice", meal: ["dinner"], diet: "veg", kind: "onedish", ing: ["coconut milk", "capsicum", "broccoli", "babycorn", "gajar"], add: { b: "", n: 0 }, me: { kcal: 520, p: 10 } },
  veg_casserole: { name: "Veg casserole + garlic bread", hi: "vegetable casserole, video jaisa, aur garlic bread toast", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/JxjGuUljSCA", ing: ["zucchini", "capsicum", "tamatar", "bread", "butter", "lasan"], add: { b: "", n: 0 }, me: { kcal: 450, p: 11 } },
  sandwich: { name: "3-layer sandwich", hi: "aloo tamatar kakdi chutney ka 3 layer sandwich (2 sandwich), dono mai ek cheese cube", meal: ["lunch", "dinner"], diet: "veg", kind: "onedish", ing: ["bread", "aloo", "tamatar", "kakdi", "cheese cubes", "dhaniya"], add: { b: "", n: 0 }, me: { kcal: 420, p: 14 } },
  vada: { name: "Vada (vada pav style)", hi: "vada pav wale vade (8 piece), saath mai fried besan pieces", meal: ["dinner"], diet: "veg", kind: "onedish", ing: ["aloo", "besan", "pav"], add: { b: "", n: 0 }, me: { kcal: 560, p: 11 } },
  soup_paratha: { name: "Tomato bell pepper soup + paratha", hi: "roasted bell pepper tamatar soup, video jaisa (ek jan ke liye)", meal: ["dinner"], diet: "veg", kind: "onedish", link: "https://youtube.com/shorts/YnrIc4wERgo", ing: ["tamatar", "bell peppers", "lasan"], add: { b: "paratha", n: 2 }, me: { kcal: 380, p: 9 } },
  dal_patties: { name: "Leftover dal patties", hi: "leftover daal se patties (poori daal finish karni hai)", meal: ["dinner"], diet: "veg", kind: "onedish", tips: ["Fridge ki saari leftover daal + 2 mashed aloo + breadcrumbs + adrak lasan + hara dhaniya", "Salt, oregano, chilli flakes", "Maida slurry mai dip, breadcrumbs coat, thode tel mai shallow fry"], ing: ["aloo", "breadcrumbs", "dhaniya"], add: { b: "", n: 0 }, me: { kcal: 400, p: 14 } },

  // ---------- non-veg (my portion, 1 person) ----------
  chicken_red: { name: "Chicken red gravy", hi: "chicken ki red gravy (tamatar wali)", meal: ["dinner", "lunch"], diet: "nonveg", kind: "gravy", ing: ["chicken", "tamatar", "kanda", "dahi"], add: { b: "paratha", n: 3 }, me: { kcal: 420, p: 50 }, pair: "split" },
  chicken_curry: { name: "Chicken curry (new style, spicy)", hi: "chicken curry, thoda different type ka, thoda teekha", meal: ["dinner"], diet: "nonveg", kind: "gravy", ing: ["chicken", "tamatar", "kanda"], add: { b: "paratha", n: 3 }, me: { kcal: 420, p: 50 }, pair: "split" },
  coconut_chicken: { name: "Coconut chicken curry", hi: "coconut wali chicken curry", meal: ["dinner"], diet: "nonveg", kind: "gravy", ing: ["chicken", "coconut milk", "kanda"], add: { b: "", n: 0, rice: "plain", rq: 2 }, me: { kcal: 480, p: 48 }, pair: "split" },
  green_chicken: { name: "Green chicken curry", hi: "hari (green) chicken curry", meal: ["dinner"], diet: "nonveg", kind: "gravy", ing: ["chicken", "dhaniya", "pudina", "dahi", "palak"], add: { b: "paratha", n: 3 }, me: { kcal: 400, p: 50 }, pair: "split" },
  butter_chicken: { name: "Butter chicken", hi: "butter chicken", meal: ["dinner"], diet: "nonveg", kind: "gravy", tips: ["Kaju badam mat daalna", "Butter aur cream thoda kam"], ing: ["chicken", "butter", "cream", "tamatar", "dahi"], add: { b: "paratha", n: 3 }, me: { kcal: 550, p: 48 }, pair: "split" },
  chicken_paneer_creamy: { name: "Spicy creamy gravy: chicken + paneer", hi: "ek spicy creamy gravy, usme thoda chicken aur thoda paneer (ALAG ALAG bartan mai)", meal: ["dinner", "lunch"], diet: "nonveg", kind: "gravy", ing: ["chicken", "paneer", "cream", "tamatar", "kanda"], add: { b: "roti", n: 5 }, me: { kcal: 480, p: 48 }, pair: "built" },
  chicken_kheema: { name: "Chicken kheema", hi: "chicken kheema", meal: ["dinner"], diet: "nonveg", kind: "dry", ing: ["chicken kheema", "kanda", "tamatar", "matar"], add: { b: "paratha", n: 3 }, me: { kcal: 400, p: 48 }, pair: "dalchawal" },
  chicken_tikka: { name: "Chicken tikka (boneless, dry)", hi: "boneless chicken tikka, tandoori style (dry)", meal: ["dinner"], diet: "nonveg", kind: "dry", ing: ["chicken", "dahi", "tandoori masala", "capsicum", "kanda"], add: { b: "roti", n: 3, salad: "lachha" }, me: { kcal: 330, p: 52 }, pair: "tikka" },
  drumsticks: { name: "Chicken drumsticks (dry)", hi: "chicken drumsticks, dry", meal: ["dinner"], diet: "nonveg", kind: "dry", ing: ["chicken drumsticks", "dahi"], add: { b: "roti", n: 3, salad: "kakdi" }, me: { kcal: 380, p: 45 }, pair: "dalchawal" },
  chicken_fry: { name: "Masala chicken fry", hi: "masala chicken fry (starter), video jaisa", meal: ["dinner"], diet: "nonveg", kind: "dry", link: "https://youtube.com/shorts/3UH0I5xwGYA", tips: ["Tel kam, shallow fry"], ing: ["chicken", "kanda"], add: { b: "", n: 0, salad: "kakdi" }, me: { kcal: 420, p: 50 }, pair: "dalchawal" },
  chicken_biryani: { name: "Chicken biryani", hi: "chicken biryani", meal: ["dinner"], diet: "nonveg", kind: "rice", ing: ["chicken", "basmati", "dahi", "kanda"], add: { b: "", n: 0, salad: "kakdi" }, me: { kcal: 650, p: 45 }, pair: "biryani" },
  chicken_rice: { name: "Chicken gravy + jeera rice", hi: "chicken ki gravy (ek jan ke liye)", meal: ["dinner", "lunch"], diet: "nonveg", kind: "gravy", ing: ["chicken", "tamatar", "kanda"], add: { b: "", n: 0, rice: "jeera", rq: 1, salad: "kakdi" }, me: { kcal: 420, p: 50 }, pair: "split" },
  prawn_curry: { name: "Prawn curry + rice", hi: "prawn curry", meal: ["dinner", "lunch"], diet: "nonveg", kind: "gravy", ing: ["prawns", "coconut milk", "tamatar", "kanda"], add: { b: "", n: 0, rice: "plain", rq: 2 }, me: { kcal: 380, p: 42 }, pair: "split" },
};

// Add-on library (from the household notes). kcal / protein are for one piece / one serving on my plate.
const ADDONS = {
  b: {
    roti: { label: "Roti", hi: (n) => `${n} roti`, kcal: 100, p: 3 },
    paratha: { label: "Paratha", hi: (n) => `${n} paratha (ghee se)`, kcal: 180, p: 4 },
    masala: { label: "Masala paratha", hi: (n) => `${n} masala paratha (ajwain wala)`, kcal: 190, p: 4 },
    maida: { label: "Maida paratha", hi: (n) => `${n} maida ke paratha (normal nahi, maida wale)`, kcal: 220, p: 4 },
  },
  dal: {
    lasan: { label: "Dal, lasan tadka in ghee", hi: "Daal: lasan ka tadka, 1 chammach ghee mai", kcal: 150, p: 7 },
    plain: { label: "Plain dal", hi: "Thodi si plain daal (2 log jitni)", kcal: 120, p: 7 },
    kanda: { label: "Dal, kanda tamatar tadka", hi: "Daal: kanda tamatar ka tadka", kcal: 140, p: 7 },
  },
  rice: {
    jeera: { label: "Jeera rice", hi: "jeera rice", kcal: 230, p: 4 },
    masala: { label: "Kanda tamatar masala rice", hi: "kanda tamatar wala masala rice", kcal: 240, p: 5 },
    plain: { label: "Plain rice", hi: "plain chawal", kcal: 200, p: 4 },
    herb: { label: "Herb rice", hi: "herb rice", kcal: 230, p: 4 },
  },
  salad: {
    kakdi: { label: "Kakdi + gajar", hi: "Kakdi aur gajar salad ke liye kaat dena", kcal: 30, p: 1 },
    lachha: { label: "Lachha pyaaz", hi: "Lachha pyaaz kaat dena (nimbu, namak)", kcal: 30, p: 1 },
    beet: { label: "Beetroot + kakdi + gajar", hi: "Beetroot, kakdi aur gajar salad ke liye kaat dena", kcal: 40, p: 1 },
  },
};

// What the partner eats when I have non-veg. {p} = partner's name.
const PAIRS = {
  split: { label: "Same gravy, half with paneer", hi: "Gravy thodi zyaada banana. Aadhi gravy ALAG nikaal ke usme paneer daal dena ({p} ke liye)", ing: ["paneer"] },
  splitveg: { label: "Same gravy, half with mixed veg", hi: "Gravy thodi zyaada banana. Aadhi gravy ALAG nikaal ke usme mixed veg daal dena ({p} ke liye)", ing: ["capsicum", "gajar", "matar"] },
  dalchawal: { label: "Dal chawal for partner", hi: "{p} ke liye daal chawal bana dena (thoda sa, ek jan jitna)", ing: ["toor dal"] },
  leftover: { label: "Partner eats leftovers", hi: "{p} ke liye fridge mai jo bacha hai ({x}) woh garam kar dena", ing: [] },
  tikka: { label: "Paneer tikka, same masala", hi: "Same masala mai {p} ke liye paneer tikka bhi bana dena (alag tray)", ing: ["paneer"] },
  biryani: { label: "Shared rice, half veg", hi: "Chawal dono ke liye ek saath. Aadhe mai chicken, aadhe mai paneer / veg ({p} ke liye) ALAG ALAG", ing: ["paneer", "matar", "gajar"] },
  patty: { label: "Veg patties + fried chicken patty", hi: "Veg patties banana, aur mere liye ek frozen chicken patty fry kar dena", ing: [] },
  built: { label: "Already has paneer", hi: "", ing: [] },
};

// Grocery items: category per item. Anything unknown goes under "Other".
const GROCERY = {
  "Veg": ["aloo", "baby aloo", "kanda", "tamatar", "bhindi", "doodhi", "palak", "gobi", "patta gobi", "capsicum", "bell peppers", "parval", "mushroom", "baingan", "broccoli", "babycorn", "zucchini", "spring onion", "gajar", "kakdi", "beetroot", "dhaniya", "pudina", "mirch", "nimbu", "adrak", "lasan", "matar", "corn"],
  "Dairy & bakery": ["paneer", "dahi", "milk", "cream", "butter", "cheese slices", "cheese cubes", "bread", "pav", "buns", "eggs"],
  "Chicken & fish": ["chicken", "chicken kheema", "chicken drumsticks", "prawns"],
  "Pantry (only if low)": ["besan", "maida", "basmati", "toor dal", "rajma", "chhole", "kala chana", "breadcrumbs", "coconut milk", "pav bhaji masala", "tandoori masala"],
};
const FROZEN = ["matar", "corn", "Frozen fries", "Frozen chicken patties (for me)"];

// Long-lasting stock: tap "running low" and it joins the next Sunday order.
const PANTRY = {
  "Staples": ["Basmati rice", "Mixed dal", "Toor dal", "Atta", "Maida", "Besan", "Rajma", "Chhole", "Kala chana", "Oil", "Ghee", "Peanuts", "Poha"],
  "Spices": ["Laal mirch", "Haldi", "Garam masala", "Chicken masala", "Salt", "Sugar", "Dhaniya powder", "Black pepper", "Hing", "Baking soda", "Garlic powder", "Tandoori masala", "Jeera (whole)", "Jeera powder", "Kashmiri mirch", "Oregano", "Chilli flakes", "Maggi masala", "Kasuri methi", "White til", "Rai (mustard seeds)", "Pav bhaji masala"],
  "Frozen": ["Frozen matar", "Frozen corn"],
};

// Per-person weekly basics that don't come from a dish.
const WEEKLY_BASICS = [["eggs", "3 dozen (my breakfasts)"], ["dahi", "1 kg"], ["tamatar", "1 kg"], ["kanda", "1 kg"], ["dhaniya", "2 bunches"], ["mirch", "100 g"], ["nimbu", "6"], ["kakdi", "for salads"], ["gajar", "for salads"]];

// Taste rules that ride along with every Indian dish.
const TASTE = {
  base: ["Tel kam daalna", "Teekha medium rakhna, zyaada spicy mat karna. Namak normal"],
  gravy: "Gravy ke upar hara dhaniya aur kasuri methi daal dena",
  dal: "Daal mai kadi patta BILKUL mat daalna",
  two: "Sirf 2 log jitna hi banana, zyaada mat banana",
};
