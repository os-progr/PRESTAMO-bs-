-- Script para inicializar la base de datos

CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    interest DECIMAL(5, 2) NOT NULL,
    term INT NOT NULL,
    loanType VARCHAR(50) NOT NULL,
    totalToReturn DECIMAL(10, 2) NOT NULL,
    remainingBalance DECIMAL(10, 2) NOT NULL,
    date DATETIME NOT NULL,
    startDate DATETIME,
    collectionDate DATETIME,
    status VARCHAR(50) DEFAULT 'Pendiente',
    rating INT DEFAULT 3,
    notes TEXT,
    maps TEXT,
    interestPaidCount INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(100) PRIMARY KEY,
    clientId VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date DATETIME NOT NULL,
    paymentType VARCHAR(50) NOT NULL,
    FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS config (
    id INT PRIMARY KEY DEFAULT 1,
    moraRate DECIMAL(5, 2) DEFAULT 0.50,
    currency VARCHAR(10) DEFAULT 'S/',
    yapeName VARCHAR(100) DEFAULT 'Juan David Puclla Quispe',
    yapePhone VARCHAR(50) DEFAULT '900 779 111'
);

-- Insertar configuración por defecto si no existe
INSERT IGNORE INTO config (id, moraRate, currency, yapeName, yapePhone) 
VALUES (1, 0.50, 'S/', 'Juan David Puclla Quispe', '900 779 111');
