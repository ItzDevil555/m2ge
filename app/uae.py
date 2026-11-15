"""UAE logistics reference data. Static, informational. Verify against official sources before use."""
VAT = 5.0
USD_AED = 3.6725
PORTS = [
 {"name": "Jebel Ali Port", "emirate": "Dubai", "type": "Sea", "ops": "Containers, general cargo, Ro-Ro", "note": "Largest port in the region, next to JAFZA"},
 {"name": "Port Rashid", "emirate": "Dubai", "type": "Sea", "ops": "Cruise, general cargo", "note": "Mina Rashid"},
 {"name": "Dubai Creek", "emirate": "Dubai", "type": "Sea", "ops": "Dhow trade", "note": "Traditional dhow wharfage"},
 {"name": "Khalifa Port", "emirate": "Abu Dhabi", "type": "Sea", "ops": "Containers, bulk", "note": "Next to KIZAD"},
 {"name": "Zayed Port", "emirate": "Abu Dhabi", "type": "Sea", "ops": "Cruise, general cargo", "note": ""},
 {"name": "Port Khalid", "emirate": "Sharjah", "type": "Sea", "ops": "Containers, general cargo", "note": ""},
 {"name": "Khor Fakkan Port", "emirate": "Sharjah", "type": "Sea", "ops": "Containers", "note": "East coast, outside Hormuz"},
 {"name": "Hamriyah Port", "emirate": "Sharjah", "type": "Sea", "ops": "Bulk, general cargo", "note": "Next to Hamriyah Free Zone"},
 {"name": "Port of Fujairah", "emirate": "Fujairah", "type": "Sea", "ops": "Oil, bulk, containers", "note": "Major bunkering hub"},
 {"name": "Saqr Port", "emirate": "Ras Al Khaimah", "type": "Sea", "ops": "Bulk, general cargo", "note": ""},
 {"name": "Port of Ajman", "emirate": "Ajman", "type": "Sea", "ops": "General cargo", "note": ""},
 {"name": "Dubai International (DXB)", "emirate": "Dubai", "type": "Air", "ops": "Passenger, belly cargo", "note": "IATA DXB"},
 {"name": "Al Maktoum International (DWC)", "emirate": "Dubai", "type": "Air", "ops": "Freighters, cargo", "note": "IATA DWC, Dubai South"},
 {"name": "Abu Dhabi International (AUH)", "emirate": "Abu Dhabi", "type": "Air", "ops": "Passenger, cargo", "note": "IATA AUH"},
 {"name": "Sharjah International (SHJ)", "emirate": "Sharjah", "type": "Air", "ops": "Passenger, cargo", "note": "IATA SHJ"},
 {"name": "Ras Al Khaimah International (RKT)", "emirate": "Ras Al Khaimah", "type": "Air", "ops": "Passenger, cargo", "note": "IATA RKT"},
 {"name": "Fujairah International (FJR)", "emirate": "Fujairah", "type": "Air", "ops": "Passenger, cargo", "note": "IATA FJR"},
 {"name": "Hatta Border", "emirate": "Dubai", "type": "Land", "ops": "Trucks to Oman", "note": ""},
 {"name": "Ghuwaifat Border", "emirate": "Abu Dhabi", "type": "Land", "ops": "Trucks to Saudi Arabia", "note": ""},
 {"name": "Al Madeena / Hili", "emirate": "Abu Dhabi", "type": "Land", "ops": "Trucks to Oman", "note": ""},
]
FREEZONES = [
 {"name": "JAFZA (Jebel Ali Free Zone)", "emirate": "Dubai", "focus": "Trading, manufacturing, logistics"},
 {"name": "DAFZA (Dubai Airport Free Zone)", "emirate": "Dubai", "focus": "Air-linked trade, electronics"},
 {"name": "DMCC", "emirate": "Dubai", "focus": "Commodities, gold, diamonds, tea"},
 {"name": "Dubai South", "emirate": "Dubai", "focus": "Aviation, e-commerce, logistics"},
 {"name": "Dubai Silicon Oasis", "emirate": "Dubai", "focus": "Technology"},
 {"name": "KIZAD", "emirate": "Abu Dhabi", "focus": "Industrial, logistics"},
 {"name": "SAIF Zone", "emirate": "Sharjah", "focus": "Trading, light industry"},
 {"name": "Hamriyah Free Zone", "emirate": "Sharjah", "focus": "Heavy industry, bulk"},
 {"name": "Ajman Free Zone", "emirate": "Ajman", "focus": "Trading, services"},
 {"name": "RAKEZ", "emirate": "Ras Al Khaimah", "focus": "Industrial, trading"},
 {"name": "Fujairah Free Zone", "emirate": "Fujairah", "focus": "Trading, oil services"},
]
CONTAINERS = [
 {"type": "20' GP", "l": 5.90, "w": 2.35, "h": 2.39, "cbm": 33.2, "payload": 28200},
 {"type": "40' GP", "l": 12.03, "w": 2.35, "h": 2.39, "cbm": 67.7, "payload": 26500},
 {"type": "40' HC", "l": 12.03, "w": 2.35, "h": 2.69, "cbm": 76.3, "payload": 26300},
 {"type": "45' HC", "l": 13.56, "w": 2.35, "h": 2.69, "cbm": 86.0, "payload": 27600},
]
DOCS = {
 "Import": ["Commercial invoice", "Packing list", "Bill of lading / Airway bill", "Certificate of origin", "Delivery order", "Import permit (regulated goods)", "Insurance certificate"],
 "Export": ["Commercial invoice", "Packing list", "Export declaration", "Certificate of origin", "Bill of lading / Airway bill", "Export permit (regulated goods)"],
 "Transit": ["Transit declaration", "Commercial invoice", "Packing list", "Bill of lading / Airway bill", "Transit guarantee", "Seal and truck details"],
 "Re-export": ["Original import declaration", "Commercial invoice", "Packing list", "Bill of lading / Airway bill", "Re-export declaration"],
 "Free zone": ["Free zone entry permit", "Commercial invoice", "Packing list", "Bill of lading / Airway bill", "Free zone authority approval"],
}
INCO = [
 ("EXW", "Buyer", "Buyer", "Buyer", "Buyer", "Any"), ("FCA", "Seller", "Buyer", "Buyer", "Buyer", "Any"),
 ("CPT", "Seller", "Seller", "Buyer", "Buyer", "Any"), ("CIP", "Seller", "Seller", "Seller", "Buyer", "Any"),
 ("DAP", "Seller", "Seller", "Seller", "Buyer", "Any"), ("DPU", "Seller", "Seller", "Seller", "Buyer", "Any"),
 ("DDP", "Seller", "Seller", "Seller", "Seller", "Any"), ("FAS", "Seller", "Buyer", "Buyer", "Buyer", "Sea"),
 ("FOB", "Seller", "Buyer", "Buyer", "Buyer", "Sea"), ("CFR", "Seller", "Seller", "Buyer", "Buyer", "Sea"),
 ("CIF", "Seller", "Seller", "Seller", "Buyer", "Sea"),
]
INCO_COLS = ["Code", "Export clearance", "Main carriage", "Insurance", "Import clearance + duty", "Mode"]
HOLIDAY_NOTE = "UAE weekend is Saturday and Sunday. Customs and ports have extended hours; check each authority."
