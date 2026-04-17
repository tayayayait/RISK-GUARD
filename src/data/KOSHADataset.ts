export interface KoshaMachineData {
  id: string; // 번호
  mainCategory: string; // 업종대분류
  subCategory: string; // 업종중분류
  minorCategory: string; // 업종소분류
  machineNameKorean: string; // 기계설비명
  machineNameEnglish: string; // 기계설비영문명
  description: string; // 기계설비설명
}

export const fetchKoshaMachines = async (): Promise<KoshaMachineData[]> => {
  try {
    const response = await fetch('/data/kosha_machines.csv');
    if (!response.ok) {
      throw new Error('Failed to load KOSHA CSV data');
    }
    const csvData = await response.text();
    // Simple CSV parser for standard format
    const lines = csvData.split('\n');
    const result: KoshaMachineData[] = [];
    
    // Skip header line (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Basic split assuming no commas in quoted fields are used, 
      // observing the provided CSV sample, fields are separated by comma without complex quoting.
      const row = line.split(',');
      if (row.length >= 7) {
        result.push({
          id: row[0],
          mainCategory: row[1],
          subCategory: row[2],
          minorCategory: row[3],
          machineNameKorean: row[4],
          machineNameEnglish: row[5],
          description: row[6],
        });
      }
    }
    return result;
  } catch (error) {
    console.error('Error fetching KOSHA data:', error);
    return [];
  }
};
