// Versículos de encorajamento para o topo do painel (tradução de João Ferreira de Almeida, citações curtas).
// Um por dia, o mesmo o dia todo; a lista dá a volta quando acaba.
export const VERSES: [string, string][] = [
  ["Não to mandei eu? Esforça-te e tem bom ânimo; não temas, nem te espantes, porque o Senhor, teu Deus, é contigo por onde quer que andares.", "Josué 1:9"],
  ["Posso todas as coisas naquele que me fortalece.", "Filipenses 4:13"],
  ["Não temas, porque eu sou contigo; não te assombres, porque eu sou teu Deus; eu te esforço, e te ajudo, e te sustento com a destra da minha justiça.", "Isaías 41:10"],
  ["Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos.", "Provérbios 16:3"],
  ["Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", "Salmos 37:5"],
  ["Porque eu bem sei os pensamentos que penso de vós, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.", "Jeremias 29:11"],
  ["E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus.", "Romanos 8:28"],
  ["Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.", "Provérbios 3:5-6"],
  ["O Senhor é o meu pastor; nada me faltará.", "Salmos 23:1"],
  ["Mas buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas.", "Mateus 6:33"],
  ["Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias; correrão e não se cansarão; caminharão e não se fatigarão.", "Isaías 40:31"],
  ["Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.", "Salmos 46:1"],
  ["Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.", "Mateus 11:28"],
  ["Porque Deus não nos deu o espírito de temor, mas de fortaleza, e de amor, e de moderação.", "2 Timóteo 1:7"],
  ["E, tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor e não aos homens.", "Colossenses 3:23"],
  ["E não nos cansemos de fazer bem, porque a seu tempo ceifaremos, se não houvermos desfalecido.", "Gálatas 6:9"],
  ["Os pensamentos do diligente tendem só à abundância.", "Provérbios 21:5"],
  ["Este é o dia que fez o Senhor; regozijemo-nos e alegremo-nos nele.", "Salmos 118:24"],
  ["As misericórdias do Senhor são a causa de não sermos consumidos; novas são cada manhã; grande é a tua fidelidade.", "Lamentações 3:22-23"],
  ["Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplica, com ação de graças.", "Filipenses 4:6"],
  ["O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.", "Filipenses 4:19"],
  ["O meu socorro vem do Senhor, que fez o céu e a terra.", "Salmos 121:2"],
  ["Esforçai-vos e tende bom ânimo; o Senhor, teu Deus, é o que vai contigo; não te deixará, nem te desamparará.", "Deuteronômio 31:6"],
  ["Se o Senhor não edificar a casa, em vão trabalham os que a edificam.", "Salmos 127:1"],
  ["Viste um homem diligente na sua obra? Perante reis será posto.", "Provérbios 22:29"],
  ["Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.", "Eclesiastes 9:10"],
  ["No mundo tereis aflições, mas tende bom ânimo; eu venci o mundo.", "João 16:33"],
  ["Alegrai-vos na esperança, sede pacientes na tribulação, perseverai na oração.", "Romanos 12:12"],
  ["Não te deixarei, nem te desampararei.", "Hebreus 13:5"],
  ["E, se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá liberalmente e não o lança em rosto; e ser-lhe-á dada.", "Tiago 1:5"],
  ["Seja sobre nós a graça do Senhor, nosso Deus; e confirma sobre nós a obra das nossas mãos.", "Salmos 90:17"],
  ["A mão dos diligentes enriquece.", "Provérbios 10:4"],
  ["Sede firmes e constantes, sempre abundantes na obra do Senhor, sabendo que o vosso trabalho não é vão no Senhor.", "1 Coríntios 15:58"],
  ["Provai e vede que o Senhor é bom; bem-aventurado o homem que nele confia.", "Salmos 34:8"],
  ["Tu conservarás em paz aquele cuja mente está firme em ti; porque ele confia em ti.", "Isaías 26:3"],
  ["A alegria do Senhor é a vossa força.", "Neemias 8:10"],
  ["Lança o teu cuidado sobre o Senhor, e ele te susterá.", "Salmos 55:22"],
  ["Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.", "1 Pedro 5:7"],
  ["A alma generosa prosperará, e o que regar também será regado.", "Provérbios 11:25"],
  ["Todavia, eu me alegrarei no Senhor, exultarei no Deus da minha salvação.", "Habacuque 3:18"],
  ["Conceda-te conforme o teu coração e cumpra todo o teu desígnio.", "Salmos 20:4"],
  ["Ora, o Deus de esperança vos encha de todo o gozo e paz em crença, para que abundeis em esperança.", "Romanos 15:13"],
  ["Instruir-te-ei e ensinar-te-ei o caminho que deves seguir; guiar-te-ei com os meus olhos.", "Salmos 32:8"],
  ["E Deus é poderoso para tornar abundante em vós toda graça, a fim de que, tendo sempre, em tudo, toda suficiência, abundeis em toda boa obra.", "2 Coríntios 9:8"],
];

/** Versículo do dia para uma data "AAAA-MM-DD": muda à meia-noite e é o mesmo para todos. */
export function verseOfDay(iso: string): { text: string; ref: string } {
  const day = Math.floor(Date.parse(iso + "T12:00:00Z") / 86_400_000);
  const [text, ref] = VERSES[((day % VERSES.length) + VERSES.length) % VERSES.length];
  return { text, ref };
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora de Brasília. */
export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now));
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}
