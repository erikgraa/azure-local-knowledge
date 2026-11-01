import { titleCase } from './text.mjs';

const AREA_RULES = [
  [/environment ?validator|env ?checker/i, 'Environment Validator'],
  [/3rd.?party|appliance|f5|big-?ip/i, '3rd-party VM appliances'],
  [/\bavd\b|virtual desktop/i, 'Azure Virtual Desktop'],
  [/\baks\b|kubernetes|aks.?arc/i, 'AKS on Azure Local'],
  [/registration/i, 'Registration'],
  [/windows admin center|\bwac\b/i, 'Windows Admin Center'],
  [/arc.?vm|azure local vm|arc-enabled virtual|virtual machine|vm management|\bvms?\b|resource bridge/i, 'Azure Local VMs'],
  [/update|solution builder|solution ?extension|\bsbe\b|cluster-aware|orchestrat|servicing/i, 'Update & SBE'],
  [/upgrade/i, 'Upgrade'],
  [/deploy|validat|bootstrap|lcm|lifecycle manager|node lifecycle|^lifecycle$|scale.?out|add.?node|repair/i, 'Deployment'],
  [/network|sdn|\batc\b|\bnic\b|firewall|proxy/i, 'Networking'],
  [/storage|spaces direct|s2d|disk|volume|\bcsv\b/i, 'Storage'],
  [/security|active directory|bitlocker|certificate|identity|defender|spn|msi\b/i, 'Security & identity'],
  [/monitor|alert|telemetry|diagnostic|observability/i, 'Monitoring & diagnostics'],
  [/operating system|\bos\b|windows server/i, 'Operating system'],
  [/portal|azure resource|\barm\b/i, 'Azure portal & ARM'],
];

/** Collapse the many spellings of a feature/folder into one filterable area. */
export function canonicalArea(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/(\d)([A-Z][a-z])/g, '$1 $2');
  for (const [re, label] of AREA_RULES) if (re.test(spaced) || re.test(s)) return label;
  return titleCase(s);
}
