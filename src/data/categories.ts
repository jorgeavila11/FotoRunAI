/**
 * Categorias de evento do FotoRun.
 * Usado pelo site e pelo servidor — para incluir uma nova categoria, adicione aqui
 * e rode o SQL que libera o novo valor na coluna events.category.
 *
 * usesBib:          o evento tem número de peito (busca por número + leitura automática na foto)
 * checkpointLabel:  como chamar os "pontos" onde os fotógrafos ficam
 * defaultCheckpoints: sugestão inicial ao cadastrar um evento novo
 */
export interface EventCategory {
  id: string;
  label: string;
  usesBib: boolean;
  checkpointLabel: string;
  defaultCheckpoints: string[];
}

export const EVENT_CATEGORIES: EventCategory[] = [
  {
    id: 'corrida_rua',
    label: 'Corrida de rua',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Largada', 'Linha de Chegada', 'Pódio & Premiação'],
  },
  {
    id: 'trail',
    label: 'Trail / corrida de montanha',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Largada', 'Subida', 'Linha de Chegada', 'Pódio & Premiação'],
  },
  {
    id: 'ciclismo',
    label: 'Ciclismo',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Largada', 'Subida', 'Linha de Chegada', 'Pódio & Premiação'],
  },
  {
    id: 'mtb',
    label: 'Mountain bike (MTB)',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Largada', 'Trecho técnico', 'Linha de Chegada', 'Pódio & Premiação'],
  },
  {
    id: 'triatlo',
    label: 'Triatlo / duatlo',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Natação', 'Transição', 'Ciclismo', 'Corrida', 'Linha de Chegada', 'Pódio & Premiação'],
  },
  {
    id: 'natacao',
    label: 'Natação / águas abertas',
    usesBib: true,
    checkpointLabel: 'Ponto da prova',
    defaultCheckpoints: ['Largada', 'Saída da água', 'Pódio & Premiação'],
  },
  {
    id: 'caminhada',
    label: 'Caminhada / passeio esportivo',
    usesBib: true,
    checkpointLabel: 'Ponto do percurso',
    defaultCheckpoints: ['Largada', 'Percurso', 'Chegada'],
  },
  {
    id: 'outros_esportes',
    label: 'Outros esportes',
    usesBib: true,
    checkpointLabel: 'Local',
    defaultCheckpoints: ['Competição', 'Pódio & Premiação'],
  },
  {
    id: 'turismo',
    label: 'Passeios e turismo',
    usesBib: false,
    checkpointLabel: 'Local do passeio',
    defaultCheckpoints: ['Embarque', 'Passeio', 'Pôr do sol'],
  },
];

export const DEFAULT_CATEGORY = 'corrida_rua';

export function getCategory(id?: string | null): EventCategory {
  return EVENT_CATEGORIES.find((c) => c.id === id) || EVENT_CATEGORIES[0];
}

export const isValidCategory = (id: unknown): id is string =>
  typeof id === 'string' && EVENT_CATEGORIES.some((c) => c.id === id);
