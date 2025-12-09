const express = require('express');
const client = require('prom-client');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
const register = new client.Registry();

// Stockage des données CSV
const csvData = {
  provence: [],
  occitanie: [],
  aquitaine: []
};

let dataIndex = {
  provence: 0,
  occitanie: 0,
  aquitaine: 0
};

const FARMS = [
  { id: 'provence', name: 'Marseille', panels: 5000, peakPower: 0.4, lat: 43.29 },
  { id: 'occitanie', name: 'Montpellier', panels: 3500, peakPower: 0.4, lat: 43.61 },
  { id: 'aquitaine', name: 'Bordeaux', panels: 4200, peakPower: 0.4, lat: 44.83 }
];

const gaugePower = new client.Gauge({
  name: 'solar_power_watts',
  help: 'Production électrique instantanée',
  labelNames: ['farm']
});

const gaugeIrradiance = new client.Gauge({
  name: 'solar_irradiance_wm2',
  help: 'Irradiance solaire mesurée',
  labelNames: ['farm']
});

const gaugeTemp = new client.Gauge({
  name: 'solar_panel_temperature_celsius',
  help: 'Température du panneau',
  labelNames: ['farm']
});

const gaugeInverter = new client.Gauge({
  name: 'solar_inverter_status',
  help: 'État de l\'onduleur (1=OK, 0=KO)',
  labelNames: ['farm']
});

register.registerMetric(gaugePower);
register.registerMetric(gaugeIrradiance);
register.registerMetric(gaugeTemp);
register.registerMetric(gaugeInverter);

// Fonction pour charger les données CSV
function loadCSVData() {
  const dataPath = path.join(__dirname, '../../data');
  const farms = ['provence', 'occitanie', 'aquitaine'];
  
  farms.forEach(farm => {
    const filePath = path.join(dataPath, `${farm}_data.csv`);
    
    if (fs.existsSync(filePath)) {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          csvData[farm].push(row);
        })
        .on('end', () => {
          console.log(`Données chargées pour ${farm}: ${csvData[farm].length} lignes`);
        })
        .on('error', (err) => {
          console.error(`Erreur lors de la lecture de ${farm}_data.csv:`, err);
        });
    } else {
      console.warn(`Fichier ${filePath} non trouvé`);
    }
  });
}

// Charger les données au démarrage
loadCSVData();


function calculateMetrics() {
  FARMS.forEach(farm => {
    let irradiance = 0;
    let temperature = 20;
    let production = 0;
    let inverterStatus = 1;

    // Récupérer les données du CSV si disponibles
    if (csvData[farm.id] && csvData[farm.id].length > 0) {
      const data = csvData[farm.id][dataIndex[farm.id]];
      
      if (data) {
        irradiance = parseFloat(data.irradiance_wm2) || 0;
        temperature = parseFloat(data.panel_temp_c) || 20;
        production = parseFloat(data.power_production_kw) || 0;
        
        // Convertir la puissance de kW à W
        production = production * 1000;
        
        // Vérifier l'état des onduleurs
        const invertersStatus = [
          parseInt(data.inverter_1_status) || 1,
          parseInt(data.inverter_2_status) || 1,
          parseInt(data.inverter_3_status) || 1,
          parseInt(data.inverter_4_status) || 1
        ];
        
        inverterStatus = invertersStatus.some(s => s === 0) ? 0 : 1;
        
        // Passer à la ligne suivante pour la prochaine itération
        dataIndex[farm.id] = (dataIndex[farm.id] + 1) % csvData[farm.id].length;
        
        if (data.anomaly_type && data.anomaly_type !== 'NORMAL') {
          console.log(`[ALERTE] ${data.anomaly_type} sur ${farm.name} - Sévérité: ${data.anomaly_severity}`);
        }
      }
    } else {
      // Fallback vers le calcul aléatoire si les données CSV ne sont pas disponibles
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;

      if (hour > 6 && hour < 18) {
        irradiance = 1000 * Math.sin(Math.PI * (hour - 6) / 12);
        irradiance = irradiance * (0.8 + Math.random() * 0.2);
      }

      temperature = 15 + (irradiance / 1000) * 30;
      
      const systemEfficiency = 0.85;
      const tempFactor = 1 + (temperature - 25) * (-0.0035);
      
      production = farm.panels * (farm.peakPower * 1000) * (irradiance / 1000) * systemEfficiency * tempFactor;

      if (Math.random() < 0.1) {
        const anomalyType = Math.floor(Math.random() * 3);
        
        if (anomalyType === 0) {
          production = 0;
          inverterStatus = 0;
          console.log(`[ALERTE] Panne onduleur sur ${farm.name}`);
        } else if (anomalyType === 1) {
          temperature += 30;
          console.log(`[ALERTE] Surchauffe sur ${farm.name}`);
        } else {
          production *= 0.5;
        }
      }
    }

    gaugePower.set({ farm: farm.id }, Math.max(0, parseFloat(production.toFixed(2))));
    gaugeIrradiance.set({ farm: farm.id }, parseFloat(irradiance.toFixed(2)));
    gaugeTemp.set({ farm: farm.id }, parseFloat(temperature.toFixed(2)));
    gaugeInverter.set({ farm: farm.id }, inverterStatus);
  });
}

setInterval(calculateMetrics, 2000);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Solar Simulator démarré sur le port ${PORT}`);
  console.log(`Métriques disponibles sur http://localhost:${PORT}/metrics`);
});