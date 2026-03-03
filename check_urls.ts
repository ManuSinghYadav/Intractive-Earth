import https from 'https';

const urls = [
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-clouds.png',
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg',
];

urls.forEach(url => {
  https.get(url, (res) => {
    console.log(`${res.statusCode} - ${url}`);
  }).on('error', (e) => {
    console.error(`Error: ${e.message} - ${url}`);
  });
});
