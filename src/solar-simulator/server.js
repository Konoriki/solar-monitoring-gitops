const express = require('express');
const client = require('prom-client');

const app = express();
const register = new client.Registry();

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


function calculateMetrics() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60; 

  FARMS.forEach(farm => {

    let irradiance = 0;
    if (hour > 6 && hour < 18) {
        irradiance = 1000 * Math.sin(Math.PI * (hour - 6) / 12);
        irradiance = irradiance * (0.8 + Math.random() * 0.2); 
    }

    let temperature = 15 + (irradiance / 1000) * 30;

    
    const systemEfficiency = 0.85; 
    const tempFactor = 1 + (temperature - 25) * (-0.0035); 
    
    let production = farm.panels * (farm.peakPower * 1000) * (irradiance / 1000) * systemEfficiency * tempFactor;

    let inverterStatus = 1;
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