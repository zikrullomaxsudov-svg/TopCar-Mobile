import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  // AI Valuation Route
  app.post('/api/ai/valuation', async (req, res) => {
    try {
      const carInput = req.body;
      if (!carInput || !carInput.brand || !carInput.model) {
        return res.status(400).json({ error: 'Missing car parameters' });
      }

      if (ai) {
        const prompt = `Siz O'zbekiston avtomobil bozori (Sergeli avtomobil bozori, Avtoelon, Olx, yangi dilerliklar) bo'yicha yetakchi ekspert va Machine Learning narx baholovchisiz.
Quyidagi avtomobil parametrlarini batafsil tahlil qiling va O'zbekiston so'midagi (UZS) haqqoniy narxini baholang:

Avtomobil: ${carInput.brand} ${carInput.model}
Yili: ${carInput.year}
Yurgan masofasi: ${carInput.mileage} km
Yoqilg'i turi: ${carInput.fuelType}
Dvigatel hajmi: ${carInput.engineVolume ? carInput.engineVolume + ' L' : "0 L (Elektromobil)"}
Batareya sig'imi (EV/Gibrid): ${carInput.batteryCapacityKwh ? carInput.batteryCapacityKwh + ' kWh' : "Yo'q"}
Yurish masofasi (CLTC/WLTP): ${carInput.electricRangeKm ? carInput.electricRangeKm + ' km' : "Yo'q"}
Elektromotor quvvati: ${carInput.electricMotorPowerKw ? carInput.electricMotorPowerKw + ' kW' : "Standart"}
Kuzov turi: ${carInput.bodyType}
Uzatmalar qutisi: ${carInput.transmission}
Keltirilgan qulayliklar va options: ${carInput.features && carInput.features.length > 0 ? carInput.features.join(', ') : "Standart"}
Kuzov holati: ${JSON.stringify(carInput.bodyParts || {})}
Dvigatel/Agregat holati: ${carInput.engineCondition}
Uzatmalar qutisi holati: ${carInput.transmissionCondition}
Avariya tarixi: ${carInput.accidentHistory}
Aniqlangan muammolar/nuqsonlar: ${carInput.additionalDefects && carInput.additionalDefects.length > 0 ? carInput.additionalDefects.join(', ') : "Yo'q"}

Baho O'zbekiston so'mida (UZS) butun sonlarda bo'lishi kerak (masalan 240000000).
Shuningdek o'zbek va rus tillarida professional tahliliy xulosa (aiAnalysisUz, aiAnalysisRu) va bozor talabi darajasi (marketDemandGrade: "high" | "medium" | "low") bering.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                predictedPriceUzs: { type: Type.INTEGER, description: 'Predicted price in UZS' },
                minimumPriceUzs: { type: Type.INTEGER, description: 'Minimum price corridor in UZS' },
                maximumPriceUzs: { type: Type.INTEGER, description: 'Maximum price corridor in UZS' },
                conditionScore: { type: Type.INTEGER, description: 'Overall vehicle score 1-100' },
                marketDemandGrade: { type: Type.STRING, description: 'high, medium, or low' },
                aiAnalysisUz: { type: Type.STRING, description: 'Detailed expert commentary in Uzbek' },
                aiAnalysisRu: { type: Type.STRING, description: 'Detailed expert commentary in Russian' },
                keyFactors: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      featureName: { type: Type.STRING },
                      impactUz: { type: Type.STRING },
                      impactRu: { type: Type.STRING },
                      deltaUzs: { type: Type.INTEGER },
                      type: { type: Type.STRING },
                    },
                    required: ['featureName', 'impactUz', 'impactRu', 'deltaUzs', 'type'],
                  },
                },
              },
              required: [
                'predictedPriceUzs',
                'minimumPriceUzs',
                'maximumPriceUzs',
                'conditionScore',
                'marketDemandGrade',
                'aiAnalysisUz',
                'aiAnalysisRu',
              ],
            },
          },
        });

        const jsonText = response.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          return res.json({
            success: true,
            source: 'gemini-3.8-flash',
            ...parsed,
          });
        }
      }

      return res.json({
        success: false,
        source: 'local-ml-engine',
        message: 'Gemini API not configured, fallback will be used',
      });
    } catch (error: any) {
      console.error('Gemini valuation error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal AI evaluation error',
      });
    }
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      app: 'TopCar Full-Stack Server',
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TopCar Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
