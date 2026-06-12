const fs = require('fs');
const css = `

/* Reporte Especial Styles */
#table-reporte-especial th {
    background-color: #2B5383;
    color: white;
    padding: 12px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
#table-reporte-especial td {
    padding: 12px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
}
#table-reporte-especial tr:nth-child(even) {
    background-color: rgba(255, 255, 255, 0.05);
}
.badge-vigente { background-color: #e2e8f0; color: #475569; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
.badge-aldia { background-color: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
.badge-atrasado { background-color: #fee2e2; color: #991b1b; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
.badge-vencido { background-color: #fef08a; color: #854d0e; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
.badge-muyatrasado { background-color: #fca5a5; color: #7f1d1d; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
.badge-acuerdo { background-color: #fef08a; color: #713f12; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
`;
fs.appendFileSync('styles.css', css);
console.log('CSS appended');
