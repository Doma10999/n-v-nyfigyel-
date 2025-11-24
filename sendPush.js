function getPercent(raw, cat) {
  const ranges = {
    "🌵Szárazkedvelő": { min: 10, max: 40 },
    "🌾Mérsékelten száraz": { min: 20, max: 45 },
    "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
    "🌱Nedvességkedvelő": { min: 50, max: 80 },
    "💧Vízigényes": { min: 70, max: 100 }
  };
  const r = ranges[cat] || {min:0, max:100};
  let p = Math.round(((raw - r.min) / (r.max - r.min)) * 100);
  if(p < 0) p = 0;
  if(p > 100) p = 100;
  return p;
}
