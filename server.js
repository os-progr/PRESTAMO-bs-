const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Servir los archivos estáticos (Frontend)
app.use(express.static(path.join(__dirname)));

// --- API Endpoints ---

// Obtener todos los clientes (y sus pagos)
app.get('/api/clients', async (req, res) => {
    try {
        const [clients] = await db.query('SELECT * FROM clients');
        const [payments] = await db.query('SELECT * FROM payments');

        // Asociar pagos a clientes
        const clientsWithPayments = clients.map(client => {
            const clientPayments = payments.filter(p => p.clientId === client.id);
            return {
                ...client,
                payments: clientPayments,
                // Convertir campos a formato esperado por el frontend
                amount: parseFloat(client.amount),
                interest: parseFloat(client.interest),
                totalToReturn: parseFloat(client.totalToReturn),
                remainingBalance: parseFloat(client.remainingBalance),
                rating: parseInt(client.rating),
                interestPaidCount: parseInt(client.interestPaidCount)
            };
        });

        res.json(clientsWithPayments);
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Guardar/Actualizar clientes
app.post('/api/clients/sync', async (req, res) => {
    const clients = req.body.clients || [];
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        for (const client of clients) {
            // Upsert Client
            await connection.query(`
                INSERT INTO clients (
                    id, name, dni, amount, interest, term, loanType, 
                    totalToReturn, remainingBalance, date, startDate, 
                    collectionDate, status, rating, notes, maps, interestPaidCount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name=VALUES(name), dni=VALUES(dni), amount=VALUES(amount),
                    interest=VALUES(interest), term=VALUES(term), loanType=VALUES(loanType),
                    totalToReturn=VALUES(totalToReturn), remainingBalance=VALUES(remainingBalance),
                    date=VALUES(date), startDate=VALUES(startDate), collectionDate=VALUES(collectionDate),
                    status=VALUES(status), rating=VALUES(rating), notes=VALUES(notes),
                    maps=VALUES(maps), interestPaidCount=VALUES(interestPaidCount)
            `, [
                client.id, client.name, client.dni, client.amount, client.interest, 
                client.term, client.loanType, client.totalToReturn, client.remainingBalance,
                new Date(client.date), client.startDate ? new Date(client.startDate) : null,
                client.collectionDate ? new Date(client.collectionDate) : null,
                client.status, client.rating || 3, client.notes || null, client.maps || null,
                client.interestPaidCount || 0
            ]);

            // Sync payments for this client
            // Primero eliminar pagos existentes
            await connection.query('DELETE FROM payments WHERE clientId = ?', [client.id]);
            
            // Insertar pagos actuales
            if (client.payments && client.payments.length > 0) {
                for (const payment of client.payments) {
                    await connection.query(`
                        INSERT INTO payments (id, clientId, amount, date, paymentType)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        payment.id, client.id, payment.amount, new Date(payment.date), payment.paymentType
                    ]);
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Datos sincronizados correctamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error sincronizando clientes:', error);
        res.status(500).json({ error: 'Error sincronizando datos' });
    } finally {
        connection.release();
    }
});

// Eliminar un cliente
app.delete('/api/clients/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Cliente eliminado' });
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// Configuración
app.get('/api/config', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM config WHERE id = 1');
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.json({
                moraRate: 0.50,
                currency: 'S/',
                yapeName: 'Juan David Puclla Quispe',
                yapePhone: '900 779 111'
            });
        }
    } catch (error) {
        console.error('Error obteniendo config:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { moraRate, currency, yapeName, yapePhone } = req.body;
        await db.query(`
            UPDATE config SET 
            moraRate = ?, currency = ?, yapeName = ?, yapePhone = ?
            WHERE id = 1
        `, [moraRate, currency, yapeName, yapePhone]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error actualizando config:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${port}`);
});
