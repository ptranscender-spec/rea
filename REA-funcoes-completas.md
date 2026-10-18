# REA 6.5.0: todas as funções

Lista completa dos comandos do `rea` (extraída de `rea --help`), agrupada por área.
Para usar via agente: `rea --mcp` (servidor MCP) ou `npx rea-agents setup`.
Detalhes de qualquer comando: `rea <comando> --help` ou `rea <comando> --schema`.

## 1. Visão geral e busca (binários nativos: requer Hopper, Ghidra ou IDA)
| Comando | O que faz |
|---|---|
| `analyze` | Visão geral de um app |
| `inspect` | Visão geral de um app com evidências |
| `decompile` | Lê uma parte do app como código |
| `function` | Analisa uma função inteira com evidências |
| `instructions` | Lê as instruções brutas sem descompilar |
| `search` | Busca em todas as strings e nomes de procedimentos analisados |
| `trace` | Rastreia uma funcionalidade literal pelas referências |
| `xrefs` | Lista referências a um endereço |
| `read-bytes` | Lê bytes exatos da memória do provedor num endereço |
| `search-bytes` | Busca padrões de bytes (com máscara) |
| `address-to-file-offset` | Converte endereço de análise em offset no arquivo |
| `annotate-native-function` | Edita anotações de uma função e devolve a análise atualizada |
| `inspect-native-api` | Reconstrói a fronteira de API de uma função |
| `inspect-native-data-type` | Inspeciona um tipo ou objeto de dados recuperado |
| `inspect-native-dispatch-metadata` | Metadados de dispatch Objective-C e Swift |
| `inspect-native-instruction` | Uma instrução com operandos decodificados |
| `inspect-native-load-image` | Verifica bytes carregados, relocações e ponto de entrada |
| `resolve-native-call-targets` | Resolve uma chamada nativa estática |
| `trace-native-values` | Rastreia dependências def-use e de chamadas |
| `trace-native-ui-action` | Liga uma ação de UI compilada ao handler nativo |
| `list-architectures` | Lista arquiteturas (sem Hopper) |

## 2. Binários e formatos de arquivo (sem motor nativo)
| Comando | O que faz |
|---|---|
| `inspect-artifact` | Inspeciona qualquer artefato e sugere próximos passos |
| `extract-artifact` | Extrai com segurança todo o conteúdo de um artefato |
| `inspect-binary-layout` | Layout do arquivo binário sem executá-lo |
| `inspect-macho` | Analisa Mach-O (macOS/iOS) |
| `inspect-signature` | Assinatura de código |
| `inspect-plist` | Metadados de plist |
| `inspect-pe-resources` | Recursos de executáveis Windows (PE) e ícones |
| `inspect-go-binary` | Compilador, módulos e build de binários Go |
| `inspect-rust-binary` | Dependências de binários Rust (cargo-auditable) |
| `inspect-wasm-artifact` | Inspeciona WebAssembly (WABT) |
| `compare-wasm-interfaces` | Compara interfaces de dois WASM |
| `inspect-evm-interface` | Interface de contratos a partir de bytecode EVM |
| `inspect-with-objdump` | Analisa com GNU objdump |
| `list-objdump-architectures` | Alvos suportados pelo objdump |
| `demangle-swift` | Decodifica símbolos Swift |
| `trace-dylib-resolution` | Resolução de bibliotecas dinâmicas (dyld) |
| `inspect-asset-catalog` | Catálogos de assets da Apple |
| `decode-interface-builder` | Decodifica storyboards e nibs compilados |
| `inspect-keyed-archive` | Arquivos keyed do Foundation como grafo |
| `inspect-sqlite-database` | Esquema e linhas de bancos SQLite |
| `inspect-recorded-crash` | Analisa core dumps e registradores de crash |

## 3. Firmware, rede e sinais
| Comando | O que faz |
|---|---|
| `inspect-firmware-regions` | Encontra regiões em firmware sem extrair |
| `extract-firmware` | Extrai partes de firmware com proveniência |
| `inspect-pcap-capture` | Captura pcap: endpoints, DNS, TLS SNI, protocolos |
| `inspect-pcap-client` | Verifica tshark/capinfos |
| `inspect-packet-capture` | Analisa captura com TShark |
| `inspect-packet-fields` | Busca campos de protocolo do TShark |
| `inspect-signal-decoders` | Decodificadores sigrok disponíveis |
| `decode-signal-recording` | Decodifica gravação de sinal (sigrok) |

## 4. JavaScript, Electron e Node
| Comando | O que faz |
|---|---|
| `analyze-javascript-application` | Reconstrói estaticamente um app JS/Electron |
| `recover-javascript-sources` | Recupera módulos JS legíveis |
| `compare-javascript-export-shapes` | Compara formatos de exports |
| `trace-javascript-semantics` | Rastreia relações semânticas |
| `trace-application-feature` | Rastreia uma funcionalidade pelo grafo do app |
| `compare-application-versions` | Compara duas versões de um app |
| `compare-source-to-bundle` | Compara código-fonte com o bundle |
| `import-reference-source` | Importa código-fonte como referência |
| `inspect-electron-fuses` | Lê os fuses do Electron |
| `list-electron-targets` | Páginas expostas via CDP |
| `inspect-electron-page` | Inspeciona uma página Electron |
| `capture-electron-scenario` | Executa um cenário Electron |
| `list-javascript-runtime-targets` | Alvos do V8 Inspector |
| `observe-javascript-runtime` | Observa um runtime Node/Electron |
| `reconcile-javascript-runtime` | Cruza evidência estática e de runtime |

## 5. Web e navegador
| Comando | O que faz |
|---|---|
| `analyze-web-bundle` | Captura e analisa o bundle JS de uma página |
| `export-web-scripts` | Exporta os scripts do site para análise |
| `inspect-web-page` | Inspeciona uma página via CDP |
| `inspect-web-event-listeners` | Onde estão os event listeners |
| `inspect-web-network-capture` | Lê HAR, mitmproxy, Fiddler, qlog |
| `capture-browser-scenario` | Roda um cenário Playwright |
| `capture-web-screenshot` | Screenshot de página |
| `compare-web-captures` / `compare-web-screenshots` | Compara capturas |
| `observe-web-execution` | Observa a execução da página |
| `observe-web-session` | Observa navegação do usuário |
| `trace-web-module-imports` | Rastreia imports de módulos |
| `trace-web-source-location` | Mapeia posição via source map |
| `discover-webmcp-tools` | Descobre ferramentas WebMCP da página |
| `list-browser-targets` | Abas de um navegador CDP local |

## 6. Android
| Comando | O que faz |
|---|---|
| `inspect-android-package` | Manifesto e declarações do APK |
| `inspect-android-class` | Membros de uma classe |
| `inspect-android-method` | Descompila um método |
| `search-android-classes` | Busca classes |
| `trace-android-references` | Quem usa uma classe/método |
| `decode-android-resources` | Decodifica recursos (apktool) |
| `inspect-apktool-client` | Verifica o apktool |
| `identify-flutter-build` | Identifica build Flutter |
| `inspect-dart-aot` | Snapshot Dart AOT |
| `project-android-application-graph` | Grafo do app Android |
| ADB (dispositivo conectado) | `list-adb-devices`, `inspect-adb-client`, `inspect-adb-device`, `inspect-adb-display`, `inspect-adb-window`, `inspect-adb-package`, `list-adb-packages`, `resolve-adb-packages`, `list-adb-processes`, `list-adb-services`, `list-adb-features`, `list-adb-directory`, `read-adb-setting`, `read-adb-logcat`, `collect-adb-bugreport`, `capture-adb-screen`, `pull-adb-file`, `push-adb-file`, `pull-adb-package`, `install-adb-package`, `uninstall-adb-package`, `start-adb-app`, `start-adb-activity`, `stop-adb-app` |

## 7. Apple, HarmonyOS e .NET
| Comando | O que faz |
|---|---|
| `project-apple-application-graph` | Grafo de app IPA/macOS |
| `project-harmony-application-graph` | Grafo de app HarmonyOS |
| `observe-native-calls` | Grava chamadas de um Mach-O sob LLDB |
| `observe-native-ui` / `capture-native-ui-scenario` | Observa e automatiza janelas nativas |
| `inspect-managed-artifact` | Identidade de assembly .NET |
| `inspect-managed-members` | Membros, assinaturas e strings .NET |
| `inspect-managed-native-boundaries` | Declarações P/Invoke |
| `verify-managed-native-boundaries` | Verifica P/Invoke contra o nativo |
| `compare-managed-members` | Compara membros entre versões |
| `import-managed-reconstruction` | Importa reconstrução de decompilador |
| `project-managed-application-graph` | Grafo do app .NET |

## 8. Depuração e instrumentação
| Comando | O que faz |
|---|---|
| `debug-with-gdb` | Comando GDB numa sessão efêmera |
| `debug-with-rizin` / `execute-rizin-command` | Comandos Rizin |
| `list-cutter-sessions` / `cutter-command` | Integração com Cutter |
| `list-frida-devices` / `list-frida-processes` | Dispositivos e processos Frida |
| `instrument-with-frida` | Roda um script Frida num processo |
| `capture-process` / `compare-process-captures` | Captura e compara processos |
| JEB | `inspect-jeb-client`, `open-jeb-project`, `list-jeb-units`, `decompile-jeb-item` |

## 9. Evidências e reconstrução
| Comando | O que faz |
|---|---|
| `evidence-export` / `evidence-import` | Exporta e importa evidências |
| `inspect-evidence-bundle` | Inspeciona um pacote de evidências |
| `inspect-analysis-view` | Vista seletiva de evidências |
| `compare` | Compara dois pacotes de evidências |
| `evaluate-reconstruction-coverage` | Avalia a cobertura da reconstrução |
| `build-reconstruction-obligation-ledger` | Gera o registro de obrigações da reconstrução |

## 10. Administração
| Comando | O que faz |
|---|---|
| `setup` | Configura agentes e provedores |
| `doctor` | Verifica se está tudo pronto |
| `providers` / `capabilities` | Provedores configurados e capacidades |
| `update` / `uninstall` | Atualiza ou remove |
| `mcp` | Registra como servidor MCP |
| `completions` | Autocompletar do shell |

**Opções globais:** `--format <toon|json|yaml|md|jsonl>`, `--filter-output`, `--full-output`, `--schema`, `--llms`, `--mcp`, `--token-limit`, `--token-offset`, `--token-count`, `--version`, `--update`.
