const interactions = [
  {
    drug_a: "Aspirin", drug_b: "Warfarin", severity: "high",
    effect: "Increased risk of bleeding",
    recommendation: "Monitor patient closely. Consider dose adjustment or alternative therapy.",
    mechanism: "Additive antiplatelet and anticoagulant effect",
    monitoring: ["INR", "signs of bleeding"]
  },
  {
    drug_a: "Ibuprofen", drug_b: "Lithium", severity: "moderate",
    effect: "Raised serum lithium levels, risk of lithium toxicity",
    recommendation: "Prefer paracetamol for pain. If needed, monitor lithium levels.",
    dosage_threshold: "Ibuprofen above 600 mg/day",
    patient_age_group: "65+"
  },
  {
    drug_a: "Ibuprofen", drug_b: "Warfarin", severity: "high",
    effect: "Increased risk of gastrointestinal bleeding",
    recommendation: "Avoid combination. Use paracetamol instead."
  },
  {
    drug_a: "Clopidogrel", drug_b: "Omeprazole", severity: "moderate",
    effect: "Reduced antiplatelet effect of clopidogrel",
    recommendation: "Use pantoprazole as the acid suppressant instead.",
    mechanism: "CYP2C19 inhibition reduces activation of clopidogrel",
    alternative: "Pantoprazole"
  },
  {
    drug_a: "Aspirin", drug_b: "Clopidogrel", severity: "moderate",
    effect: "Increased risk of bleeding",
    recommendation: "Usually intended as dual antiplatelet therapy. Confirm with prescriber and add gastric protection.",
    clinical_note: "Standard after coronary stenting for a fixed duration",
    intended_combination: true
  },
  {
    drug_a: "Clarithromycin", drug_b: "Simvastatin", severity: "contraindicated",
    effect: "Greatly raised simvastatin levels, risk of myopathy and rhabdomyolysis",
    recommendation: "Do not dispense together. Suspend simvastatin during the antibiotic course.",
    mechanism: "Strong CYP3A4 inhibition"
  },
  {
    drug_a: "Amlodipine", drug_b: "Simvastatin", severity: "moderate",
    effect: "Raised simvastatin levels, risk of myopathy",
    recommendation: "Limit simvastatin dose.",
    dosage_threshold: "Simvastatin above 20 mg/day"
  },
  {
    drug_a: "Atorvastatin", drug_b: "Clarithromycin", severity: "moderate",
    effect: "Raised atorvastatin levels",
    recommendation: "Use the lowest atorvastatin dose during the course.",
    dosage_threshold: "Atorvastatin above 20 mg/day"
  },
  {
    drug_a: "Isosorbide Mononitrate", drug_b: "Sildenafil", severity: "contraindicated",
    effect: "Severe, possibly fatal fall in blood pressure",
    recommendation: "Never dispense together.",
    mechanism: "Both raise cyclic GMP, causing profound vasodilation"
  },
  {
    drug_a: "Ciprofloxacin", drug_b: "Theophylline", severity: "high",
    effect: "Theophylline toxicity: nausea, arrhythmia, seizures",
    recommendation: "Reduce theophylline dose or choose another antibiotic.",
    monitoring: ["theophylline levels"]
  },
  {
    drug_a: "Lisinopril", drug_b: "Spironolactone", severity: "high",
    effect: "Hyperkalaemia",
    recommendation: "Monitor serum potassium and renal function.",
    patient_age_group: "65+",
    risk_factors: ["renal impairment", "diabetes"]
  },
  {
    drug_a: "Losartan", drug_b: "Spironolactone", severity: "moderate",
    effect: "Hyperkalaemia",
    recommendation: "Monitor serum potassium."
  },
  {
    drug_a: "Fluoxetine", drug_b: "Tramadol", severity: "high",
    effect: "Serotonin syndrome and lowered seizure threshold",
    recommendation: "Avoid combination or monitor closely for agitation, tremor and fever."
  },
  {
    drug_a: "Sertraline", drug_b: "Tramadol", severity: "high",
    effect: "Serotonin syndrome",
    recommendation: "Avoid combination where possible."
  },
  {
    drug_a: "Methotrexate", drug_b: "Trimethoprim", severity: "high",
    effect: "Bone marrow suppression",
    recommendation: "Avoid combination.",
    mechanism: "Additive antifolate effect and reduced methotrexate clearance"
  },
  {
    drug_a: "Amiodarone", drug_b: "Digoxin", severity: "high",
    effect: "Digoxin toxicity",
    recommendation: "Halve the digoxin dose and monitor levels.",
    dose_adjustment: { drug: "Digoxin", change: "reduce by 50 percent" },
    monitoring: ["digoxin levels", "heart rate"]
  },
  {
    drug_a: "Digoxin", drug_b: "Furosemide", severity: "moderate",
    effect: "Low potassium increases risk of digoxin toxicity",
    recommendation: "Monitor serum potassium."
  },
  {
    drug_a: "Allopurinol", drug_b: "Azathioprine", severity: "high",
    effect: "Severe bone marrow suppression",
    recommendation: "Reduce azathioprine dose to a quarter, or avoid.",
    dose_adjustment: { drug: "Azathioprine", change: "reduce to 25 percent" }
  },
  {
    drug_a: "Calcium Carbonate", drug_b: "Levothyroxine", severity: "moderate",
    effect: "Reduced absorption of levothyroxine",
    recommendation: "Take levothyroxine at least 4 hours apart.",
    separate_by_hours: 4
  },
  {
    drug_a: "Metronidazole", drug_b: "Warfarin", severity: "high",
    effect: "Raised INR and bleeding risk",
    recommendation: "Reduce warfarin dose and monitor INR.",
    monitoring: ["INR"]
  },
  {
    drug_a: "Fluconazole", drug_b: "Warfarin", severity: "high",
    effect: "Raised INR and bleeding risk",
    recommendation: "Monitor INR closely during and after the course."
  },
  {
    drug_a: "Paracetamol", drug_b: "Warfarin", severity: "low",
    effect: "Regular use may raise INR",
    recommendation: "Occasional doses are safe. Monitor INR with regular use.",
    dosage_threshold: "Paracetamol above 2 g/day for several days"
  },
  {
    drug_a: "Ibuprofen", drug_b: "Prednisolone", severity: "moderate",
    effect: "Increased risk of gastrointestinal ulceration",
    recommendation: "Add gastric protection."
  },
  {
    drug_a: "Aspirin", drug_b: "Ibuprofen", severity: "moderate",
    effect: "Ibuprofen can reduce the cardioprotective effect of low-dose aspirin",
    recommendation: "Take aspirin at least 30 minutes before ibuprofen.",
    separate_by_hours: 0.5
  },
  {
    drug_a: "Lisinopril", drug_b: "Lithium", severity: "high",
    effect: "Lithium toxicity",
    recommendation: "Monitor lithium levels closely.",
    monitoring: ["lithium levels"]
  },
  {
    drug_a: "Fluconazole", drug_b: "Glimepiride", severity: "moderate",
    effect: "Risk of hypoglycaemia",
    recommendation: "Monitor blood glucose."
  },
  {
    drug_a: "Ondansetron", drug_b: "Tramadol", severity: "low",
    effect: "Reduced analgesic effect of tramadol",
    recommendation: "Monitor pain control."
  },
  {
    drug_a: "Azithromycin", drug_b: "Hydroxychloroquine", severity: "high",
    effect: "QT prolongation and arrhythmia",
    recommendation: "Obtain an ECG before and during treatment.",
    monitoring: ["ECG"]
  },
  {
    drug_a: "Rifampicin", drug_b: "Warfarin", severity: "moderate",
    effect: "Reduced anticoagulant effect",
    recommendation: "Increase warfarin dose under INR monitoring.",
    onset: "delayed, over 1 to 2 weeks"
  },
  {
    drug_a: "Carbamazepine", drug_b: "Clarithromycin", severity: "high",
    effect: "Carbamazepine toxicity",
    recommendation: "Avoid, or monitor carbamazepine levels."
  }
];

export default interactions;
