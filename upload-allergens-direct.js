// Paste this entire script into the browser console on Mama Santa's menu editor page
// This version uses direct API calls instead of the app's message system

const updatedOverlays =
[
  {
    "h": 1.4126736111111045,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 22.519618055555554,
    "id": "Large Antipasto",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy",
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3565972222222276,
    "w": 40.127546296296316,
    "x": 5.679861111111111,
    "y": 23.932291666666657,
    "id": "Medium Antipasto",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy",
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 3.8666666666666742,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 25.288888888888884,
    "id": "Small Antipasto",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy",
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4956597222222179,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 29.15555555555556,
    "id": "Lettuce Salad",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.2098090277777835,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 30.651215277777776,
    "id": "Anchovy Fillets",
    "diets": [],
    "details": {},
    "allergens": [
      "fish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4400173611111091,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 31.86102430555556,
    "id": "Black Olives",
    "diets": [
      "Vegetarian",
      "Vegan"
    ],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5020833333333266,
    "w": 40.25231481481483,
    "x": 5.679861111111111,
    "y": 33.30104166666667,
    "id": "Chicken Soup - or - Minestrone",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.24131944444445,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 34.803124999999994,
    "id": "Shrimp Cocktail",
    "diets": [
      "Pescatarian"
    ],
    "details": {},
    "allergens": [
      "shellfish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.2888888888888914,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 36.044444444444444,
    "id": "Order of Garlic Toast",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3333333333333286,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 37.333333333333336,
    "id": "Basket of Garlic Toast",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6303819444444465,
    "w": 40.364583333333336,
    "x": 5.679861111111111,
    "y": 38.666666666666664,
    "id": "Homemade Mozzarella Sticks -or- Zucchini Sticks",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4609375000000024,
    "w": 40.252314814814824,
    "x": 5.679861111111111,
    "y": 40.29704861111111,
    "id": "Mixed Olives",
    "diets": [
      "Vegetarian",
      "Vegan"
    ],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.7064236111111084,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 45.78541666666666,
    "id": "Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.1878472222222292,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 47.49184027777777,
    "id": "Meatball",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3647569444444443,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 48.6796875,
    "id": "Veal Cutlet",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3770833333333417,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 51.429340277777776,
    "id": "Veal with Onion, Green Pepper and Cheese",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3381944444444485,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 52.806423611111114,
    "id": "Veal with Mushroom Sauce",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4559027777777667,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 54.14461805555556,
    "id": "Veal Parmigiana",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4036458333333366,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 55.60052083333333,
    "id": "Chicken Parmigiana Sandwich",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.396180555555558,
    "w": 40.554050925925935,
    "x": 5.378125000000001,
    "y": 57.00416666666666,
    "id": "Fish Sandwich",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.616666666666668,
    "w": 41.00405092592593,
    "x": 4.928125,
    "y": 60.93333333333333,
    "id": "Meat Balls (3) with Sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5204861111111256,
    "w": 41.00405092592593,
    "x": 4.928125,
    "y": 62.55,
    "id": "Sausage (2) with Sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3668402777777686,
    "w": 41.004050925925924,
    "x": 4.928125,
    "y": 64.07048611111112,
    "id": "French Fries",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3885416666666686,
    "w": 40.77245370370371,
    "x": 4.928125,
    "y": 65.41197916666667,
    "id": "Fried Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4859375000000021,
    "w": 41.00405092592593,
    "x": 4.928125,
    "y": 66.80052083333334,
    "id": "Fried Green Peppers",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4826388888888735,
    "w": 41.00405092592593,
    "x": 4.928125,
    "y": 68.28645833333334,
    "id": "Trippe Green Pepper, Onion",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5854166666666778,
    "w": 41.00405092592594,
    "x": 4.928125,
    "y": 69.76909722222221,
    "id": "Sausage, Onion, Green Pepper",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3121527777777828,
    "w": 41.00405092592593,
    "x": 4.928125,
    "y": 71.35451388888889,
    "id": "Broccoli",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5354166666666613,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 77,
    "id": "Homemade Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3756944444444485,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 78.53541666666666,
    "id": "One Half Fried Chicken",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.399479166666662,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 79.91111111111111,
    "id": "Shrimp Dinner",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3598958333333384,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 81.31059027777778,
    "id": "Small T-Bone Steak",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5234375000000007,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 82.67048611111112,
    "id": "Large T-Bone Steak",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5921875000000023,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 84.19392361111112,
    "id": "Fish Fry",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6447916666666673,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 26.51076388888889,
    "id": "Cavattelli with Meat Balls",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4625000000000035,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 28.155555555555555,
    "id": "Fettuccini with Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5645833333333314,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 29.51111111111111,
    "id": "Fettuccini with Red or White Clam Sauce",
    "diets": [
      "Pescatarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "shellfish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4855902777777836,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 31.07569444444444,
    "id": "Fettuccini with Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4340277777777783,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 32.561284722222226,
    "id": "Fettuccini with Garlic, Oil and Parsley",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5380208333333272,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 33.995312500000004,
    "id": "Fettuccini with Butter Sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4839843750000044,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 35.53333333333333,
    "id": "Fettuccini with Meat Balls",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6493489583333272,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 37.01731770833334,
    "id": "Fettuccini Alfredo with Chicken Cutlet",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6303819444444443,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 38.666666666666664,
    "id": "Spaghetti Di Casa with Meat Balls",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4609375,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 40.29704861111111,
    "id": "Spaghetti Di Casa with Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5213541666666717,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 41.75798611111111,
    "id": "Spaghetti Di Casa with Shrimp Marinara Sauce",
    "diets": [
      "Pescatarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "shellfish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4836805555555606,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 43.27934027777778,
    "id": "Lasagna with Ricotta and Meat",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.465277777777775,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 44.763020833333336,
    "id": "Ravioli with Cheese or Meat",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4605902777777686,
    "w": 40.94814814814814,
    "x": 50.45925925925926,
    "y": 46.228298611111114,
    "id": "Manicotti Stuffed with Ricotta",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.710069444444452,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 47.68888888888888,
    "id": "Cannelloni Stuffed with Meat",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4973958333333286,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 52.13576388888889,
    "id": "Penne with Meat Balls",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5046875000000086,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 53.63315972222222,
    "id": "Penne with Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.551388888888889,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 55.13784722222223,
    "id": "Spaghetti with Meat Sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3975694444444335,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 56.689236111111114,
    "id": "Gluten Free Pasta - or - Whole Wheat Pasta",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6687500000000028,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 58.08680555555555,
    "id": "Spaghetti with Sausage",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5633680555555574,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 59.75555555555555,
    "id": "Spaghetti with Marinara Sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5765625000000094,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 61.31892361111111,
    "id": "Spaghetti with Red or White Clam Sauce",
    "diets": [
      "Pescatarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "shellfish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4822916666666615,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 62.89548611111112,
    "id": "Spaghetti with Meat Balls",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6272569444444387,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 64.37777777777778,
    "id": "Spaghetti with Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5473958333333266,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 66.00503472222222,
    "id": "Spaghetti with Butter - or- Garlic, Oil and Parsley",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6166666666666831,
    "w": 40.98958333333333,
    "x": 50.417824074074076,
    "y": 67.55243055555555,
    "id": "Spaghetti with Shrimp Marinara Sauce",
    "diets": [
      "Pescatarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "egg",
      "shellfish"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6548611111111142,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 71.8217013888889,
    "id": "Veal Parmigiana with Tomato Sauce, Cheese",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5234374999999858,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 73.47656250000001,
    "id": "Veal Cutlet - Fried Veal",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 3.2079861111111074,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 75,
    "id": "Chicken Cacciatori with Tomato and Red Wine Sauce, Onion, Green Pepper and Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 3.1026041666666657,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 78.20798611111111,
    "id": "Veal Scalloppini with Tomato and Red Wine Sauce, Onion, Green Pepper and Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 2.88333333333334,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 81.31059027777778,
    "id": "Veal Pizzaiola with White Wine Sauce, Onion, Green Pepper and Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.5921875000000085,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 84.19392361111112,
    "id": "Chicken Parmigiana",
    "diets": [],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6675347222222063,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 85.78611111111113,
    "id": "Eggplant Parmigiana",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy",
      "egg"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 3.28125,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 87.45364583333333,
    "id": "Chicken Pizzaiola with White Wine Sauce, Onion, Green Pepper and Mushrooms",
    "diets": [
      "Vegetarian"
    ],
    "details": {},
    "allergens": [
      "wheat",
      "gluten",
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 3.0494791666666607,
    "w": 41.522916666666674,
    "x": 50.417824074074076,
    "y": 93.4,
    "id": "Kidney Beans - Fagioli; Lentils - Lenticchie; Chick Peas - Cici; Peas - Piselli",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6260416666666564,
    "w": 41.285300925925924,
    "x": 4.415277777777778,
    "y": 92.59496527777777,
    "id": "Spumoni",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.3602430555555856,
    "w": 41.28530092592594,
    "x": 4.415277777777778,
    "y": 94.22100694444443,
    "id": "Cannoli",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.4097222222222066,
    "w": 41.28530092592594,
    "x": 4.415277777777778,
    "y": 95.58125000000001,
    "id": "Tiramisu",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6152777777777885,
    "w": 41.51689814814816,
    "x": 4.415277777777778,
    "y": 96.99097222222221,
    "id": "Chocolate or Lemon Truffle",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.6947916666666667,
    "w": 5.8487268518518505,
    "x": 4.415277777777778,
    "y": 86.93541666666665,
    "id": "Alfredo sauce",
    "diets": [],
    "details": {},
    "allergens": [
      "dairy"
    ],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.69479166666666,
    "w": 3.6322916666666636,
    "x": 10.264004629629628,
    "y": 86.93541666666665,
    "id": "Pesta sauce",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  },
  {
    "h": 1.69479166666666,
    "w": 10.025694444444445,
    "x": 15.311574074074073,
    "y": 86.93541666666665,
    "id": "Derosa sauce",
    "diets": [],
    "details": {},
    "allergens": [],
    "removable": [],
    "crossContamination": []
  }
]
;

// Direct API upload function
async function uploadAllergensDirect() {
  console.log('Uploading allergen data for', updatedOverlays.length, 'items via direct API call...');
  
  try {
    // Get user's auth token from localStorage
    const authToken = localStorage.getItem('sb-fgoiyycctnwnghrvsilt-auth-token');
    if (!authToken) {
      console.error('Not logged in! Please log in first.');
      return;
    }
    
    const auth = JSON.parse(authToken);
    const accessToken = auth?.access_token;
    
    if (!accessToken) {
      console.error('Could not find access token');
      return;
    }
    
    // Update via authenticated API call
    const response = await fetch('https://fgoiyycctnwnghrvsilt.supabase.co/rest/v1/restaurants?slug=eq.mama-santa-s', {
      method: 'PATCH',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ overlays: updatedOverlays })
    });
    
    if (response.ok) {
      console.log('✅ SUCCESS! Allergen data uploaded for all 76 menu items!');
      console.log('Refresh the page to see the updated allergen information.');
      alert('Success! Allergen data uploaded for all 76 menu items. Please refresh the page.');
    } else {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
      alert('Upload failed: ' + errorText);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    alert('Upload error: ' + err.message);
  }
}

uploadAllergensDirect();
