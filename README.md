# Security+ Hub

**Português** | [English](./README.en.md)

Uma plataforma de estudos gratuita, no navegador, para a prova **CompTIA Security+ SY0-701**. Tudo
roda no seu navegador — sem conta, sem instalação — e seu progresso fica salvo localmente, no seu
próprio aparelho. Estude online ou offline.

> Todo o conteúdo de estudo (questões, conceitos, siglas e a interface) está em **português do
> Brasil**, voltado a quem está se preparando para o exame SY0-701.

## O que tem dentro

A plataforma é dividida em módulos:

- **Questões** — um banco de **830 questões comentadas** com um motor *adaptativo* que prioriza os
  temas em que você mais erra. As alternativas são embaralhadas, cada resposta revela uma
  explicação, e você filtra e acompanha seu progresso por domínio. Há uma opção honesta de
  *"Não sei"* e navegação completa por teclado.
- **Conceitos** — **568 flashcards** em *modo cenário*: a frente traz uma situação prática do dia a
  dia e você nomeia o conceito por trás dela, em vez de só decorar uma definição.
- **Siglas** — **336 flashcards de siglas** com **autoavaliação de confiança de 1 a 5**: as que você
  avalia baixo voltam com mais frequência. Um modo de **consulta A–Z** com busca serve também como
  referência rápida. Siglas com mais de um significado oficial (como MAC ou PAM) viram um card por
  significado.
- **Simulado** — uma **prova cronometrada** no formato real: até **90 questões em 90 minutos**,
  pontuada na escala oficial de 100 a 900, com um resumo por domínio e uma lista de *"o que
  estudar"* ao final, apontando as aulas ligadas às questões que você errou.
- **Metodologia** — como o material de estudo foi construído e revisado.

### Aprofunde em qualquer item

Cada questão, conceito e sigla tem link para a aula específica do **Professor Messer** (site +
YouTube) que cobre o tema. Itens sem aula em vídeo apontam para o verbete correspondente no
**glossário NIST CSRC**, e cada card ainda tem um botão do **Google** ajustado para retornar
resultados em português — então dá sempre para investigar o *porquê* por trás de uma resposta.

## O motor de reincidência (repetição espaçada)

Questões, conceitos e siglas compartilham um mesmo agendador de revisões baseado na **curva do
esquecimento**. Em vez de repetir em ordem fixa ou só pela taxa de erro, ele estima, item a item, a
chance de você ainda lembrar do conteúdo agora e prioriza o que está mais perto de ser esquecido.

Em resumo:

- Cada item guarda uma **meia-vida de memória** `h` (em dias) e quando você o viu por último.
- A **retrievabilidade** — a chance de recordar agora — segue
  `R = piso + (recall_fresco − piso)·2^(−Δt/h)`: recém-revisado, `R` fica perto de 100%; quanto mais
  tempo parado, mais `R` cai rumo a um piso.
- O que volta é sorteado pela **chance de falha** `(1 − R)/R`: o esquecido retorna, o dominado
  descansa.
- Cada revisão reajusta `h` de forma *spacing-aware* — recuperar algo que você já estava quase
  esquecendo alonga bastante o próximo intervalo; um tropeço encurta e reprograma o item para breve.

O modelo foi **desenhado por um fluxo dinâmico de agentes estatísticos** e depois **validado num
laboratório Monte Carlo com alunos sintéticos** — memórias-verdade, invisíveis ao modelo, que
esquecem em tempo real. Ao longo de **~29,8M de revisões sintéticas**, foi comparado a baselines
(aleatório, Leitner e o modelo anterior) e checado em calibração, retenção de longo prazo, escassez
de revisões, monotonicidade e casos-limite, em cinco perfis de aluno (típico, rápido, lento,
autoavaliação ruidosa e esquecimento tipo lei-de-potência).

## A prova alvo — CompTIA Security+ (SY0-701)

Os cinco domínios oficiais e seus pesos na prova:

| Domínio | Área | Peso |
|:-------:|------|:----:|
| 1.0 | Conceitos Gerais de Segurança | 12% |
| 2.0 | Ameaças, Vulnerabilidades e Mitigações | 22% |
| 3.0 | Arquitetura de Segurança | 18% |
| 4.0 | Operações de Segurança | 28% |
| 5.0 | Gestão e Supervisão do Programa de Segurança | 20% |

- Código do exame **SY0-701** — até **90 questões**, **90 minutos**.
- Nota de aprovação **750** numa escala de **100 a 900**.
- Tipos de questão: múltipla escolha e baseadas em desempenho (PBQ).
- Lançado em **7 de novembro de 2023**.

O banco de questões é distribuído entre esses domínios, e o simulado sorteia um conjunto
equilibrado pelos pesos, para espelhar as proporções da prova real.

## Seu progresso e privacidade

- Seu progresso fica **só no seu navegador** — nada é enviado para lugar nenhum e não precisa de
  conta.
- O app funciona **offline** depois do primeiro carregamento.
- Cada módulo permite **exportar e importar** um backup do seu progresso, para levar entre
  navegadores ou aparelhos.

## Apoie

Tudo aqui é **gratuito, sem anúncios e sem cadastro**, e a ideia é continuar assim. Manter o banco
de questões, os conceitos e as siglas alinhados com a prova tem um custo real: mesmo com a IA no
trabalho pesado, a orquestração por trás exige cognição, tempo e dinheiro — se o Hub te ajudar nos
estudos, você pode retribuir com um **Pix** de qualquer valor, quando quiser. É totalmente opcional.

- **Na barra superior:** clique no ícone de doação (a xícara) em qualquer página para abrir o QR do
  Pix.
- **Direto pelo link:** [Apoiar via Pix (LivePix)](https://livepix.gg/znttf0x)

## Aviso

Este é um material de estudo independente, não afiliado nem endossado pela CompTIA. "CompTIA" e
"Security+" são marcas de seus donos; os Exam Objectives SY0-701 (V7.0) são © CompTIA e usados
apenas como referência de escopo. As notas do simulado são estimativas numa escala 100–900
(aprovação de referência 750), não a pontuação oficial. Recomendamos sempre cruzar com os
objetivos oficiais mais recentes.
