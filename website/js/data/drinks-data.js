/**
 * drinks-data.js
 *
 * Sample hierarchical data for the multiscroller.
 * 3 levels: beverage type → category → specific item.
 *
 * Structured with interposers (name + subtree) so TreeOfData
 * extracts display names automatically.
 */

const beveragesTree = {
  "tea": { "name": "Tea", "types": {
    "black":  { "name": "Black Tea",  "items": [
      "Earl Grey", "English Breakfast", "Darjeeling", "Assam",
      "Ceylon", "Keemun", "Lapsang Souchong"
    ]},
    "green":  { "name": "Green Tea",  "items": [
      "Sencha", "Matcha", "Dragon Well", "Gyokuro",
      "Gunpowder", "Hojicha", "Genmaicha"
    ]},
    "herbal": { "name": "Herbal Tea", "items": [
      "Chamomile", "Peppermint", "Rooibos", "Hibiscus",
      "Ginger", "Lavender", "Echinacea"
    ]},
    "oolong": { "name": "Oolong Tea", "items": [
      "Tieguanyin", "Da Hong Pao", "Dong Ding",
      "Ali Shan", "Oriental Beauty"
    ]},
    "white":  { "name": "White Tea",  "items": [
      "Silver Needle", "White Peony", "Shou Mei", "Moonlight White"
    ]},
    "puerh":  { "name": "Pu-erh Tea", "items": [
      "Shou (Ripe)", "Sheng (Raw)", "Aged Shou", "Aged Sheng"
    ]}
  }},
  "coffee": { "name": "Coffee", "types": {
    "espresso": { "name": "Espresso Drinks", "items": [
      "Espresso", "Americano", "Cappuccino", "Latte",
      "Mocha", "Macchiato", "Cortado", "Flat White"
    ]},
    "filter":   { "name": "Filter Coffee",   "items": [
      "Pour Over", "French Press", "Aeropress",
      "Cold Brew", "Drip", "Siphon"
    ]},
    "origin":   { "name": "Single Origin",   "items": [
      "Ethiopian", "Colombian", "Kenyan",
      "Guatemalan", "Sumatran", "Jamaican Blue"
    ]}
  }},
  "juice": { "name": "Juice", "types": {
    "citrus":   { "name": "Citrus",   "items": [
      "Orange", "Grapefruit", "Lemon", "Lime",
      "Tangerine", "Blood Orange"
    ]},
    "berry":    { "name": "Berry",    "items": [
      "Blueberry", "Cranberry", "Acai",
      "Pomegranate", "Raspberry"
    ]},
    "tropical": { "name": "Tropical", "items": [
      "Mango", "Pineapple", "Passionfruit",
      "Guava", "Coconut", "Papaya", "Lychee"
    ]}
  }}
};

export { beveragesTree };