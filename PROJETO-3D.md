# Projeto 3D: as imagens do empreendimento na Central

Escrito em 14/10/2026. Pedido: "adicionei 22 novas fotos no git, use essas fotos
na Central do Cliente pra Caucaia 2, pode colocar todas pro cliente ver o
projeto 3D, e em obras futuras coloque Villagio Caucaia III".

## Onde as imagens ficam

As 22 imagens subiram pelo site do GitHub como PNG de 2 a 3,4 MB cada (55 MB ao
todo), na raiz do repositório, com nomes aleatórios. Isso é pesado demais para
servir: cada uma foi convertida para `fotos/villagio-caucaia-2/NN.webp` (1600 de
largura, para a tela cheia e os topos das páginas) e `NN-mini.webp` (480, para
a grade), 5,3 MB ao todo. A numeração NN segue a ordem alfabética dos nomes
originais. Os PNG saíram do repositório; se precisar de um original, está no
histórico do git (commits "Add files via upload" de 14/10).

Conversão: `scratchpad/central_fotos_converter.sh` (ffmpeg, lanczos, webp 82 e
78). Para imagens novas, repetir a conversão e acrescentar à lista.

## A lista

Em `index.html`, `FOTOS_EMPREENDIMENTO['VILLAGIO CAUCAIA II'].imagens`: cada
item tem o número do arquivo (`a`), a legenda (`t`) e o grupo (`g`: `lazer` ou
`apartamento`). A ordem da lista é a ordem da galeria: áreas de lazer primeiro,
depois os ambientes do apartamento. As legendas descrevem o que a imagem mostra
(centro comercial, piscina, lounge com lareira, redário, jardim, terraço,
espaço gourmet, quadra, fitness, parede de escalada, espaço pet, brinquedoteca;
living, sala de jantar, sala de estar, sala com TV, cozinha e lavanderia,
suíte, quarto, quarto com home office, quarto infantil).

A mesma entrada diz qual imagem vai no topo de cada página: `extrato` (lounge
com lareira), `obra` (o centro comercial visto de cima; substituída pela foto
aprovada mais recente da obra, quando houver) e `galeria` (a piscina). A tela
de entrada usa o redário ao pôr do sol, fixo no CSS.

Tudo é amarrado ao **nome do empreendimento** da casa do cliente (como está na
planilha, em maiúsculas). Um empreendimento sem entrada no mapa vê a galeria com
"Em breve" e os topos escuros com as barras: melhor sem imagem do que com a
imagem de outro lugar.

## A página

- Menu: "Projeto 3D" na lateral; no celular, o terceiro lugar da barra de
  baixo ("Projeto"). "Futuros projetos" continua na lateral e, no celular,
  abre pelo "Menu".
- (14/10, tarde, "as fotos 3D deixe de um jeito mais bonito") Uma **vitrine**
  grande no alto: a imagem escolhida em 16:9, o grupo em vermelho, a legenda, o
  contador e as setas; a vitrine troca sozinha a cada 7 segundos (para com o
  mouse em cima, com a tela cheia aberta, fora da página ou com movimento
  reduzido). Embaixo, a **tira de miniaturas** (rola para o lado, a ativa com
  contorno vermelho). Depois, as imagens **por ambiente**, "Áreas de lazer" e
  "O apartamento", em cartões iguais com a legenda escrita embaixo.
- Tocar na vitrine ou num cartão abre a tela cheia: a imagem em 1600, legenda,
  contador ("3 / 22"), setas, teclado (Esc, setas) e, no celular, arrastar para
  o lado. Ao fechar, a vitrine fica na imagem em que a pessoa parou.

## Futuros projetos

Saiu a demonstração (três projetos inventados com fotos de banco de imagens).
Entra o Villagio Caucaia III, com selo "Em breve", sem imagem (não há render
dele) e sem número inventado. Quando houver material, o cartão recebe a foto e
o texto.

## Teste

`scratchpad/win/ver-central-cel.cjs`: no celular, abre a galeria pela barra,
confere as 22 imagens, o filtro Apartamento (9), a tela cheia (piscina,
3 / 22, a seta vai para 4 / 22, Esc fecha) e Futuros projetos pelo Menu (um
cartão, Villagio Caucaia III, sem aviso de demonstração).
