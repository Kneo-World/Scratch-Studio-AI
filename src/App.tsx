import { useState, useRef, ChangeEvent, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, Download, Wand2, Rocket, Gamepad2, Music, Palette, 
  AlertCircle, Eye, Code, Library, Upload, Check, ChevronRight,
  ArrowLeft, Save, Play, Search, Filter, Info, Users, ShieldCheck,
  CreditCard, ExternalLink, LogOut, LogIn
} from "lucide-react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/themes/prism.css";
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, User 
} from "firebase/auth";
import { 
  doc, setDoc, getDoc, onSnapshot, increment 
} from "firebase/firestore";

import { cn } from "@/src/lib/utils";
import { Button } from "./components/Button";
import { Input } from "./components/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/Card";
import { 
  createSb3File, SCRATCH_PROMPT_SYSTEM, SCRATCH_PREVIEW_PROMPT, 
  ASSET_LIBRARY, ScratchAsset 
} from "./services/scratchService";
import { initFirebase, getAuthClient, getDb } from "./lib/firebase";

const getApiKey = () => {
  return process.env.GEMINI_API_KEY || (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

type AppState = "idle" | "previewing" | "generating" | "editing";

interface ProjectPlan {
  title: string;
  sprites: string[];
  scriptsDescription: string;
  variables: string[];
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const auth = getAuthClient();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<AppState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [projectJson, setProjectJson] = useState<any>(null);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(ASSET_LIBRARY.map(a => a.id));
  const [customAssets, setCustomAssets] = useState<ScratchAsset[]>([]);
  const [isKidMode, setIsKidMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const setup = async () => {
      await initFirebase();
      const auth = getAuthClient();
      const db = getDb();
      
      if (!auth || !db) return;

      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if (user) {
          try {
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                createdAt: new Date().toISOString()
              });
              const statsRef = doc(db, "stats", "global");
              await setDoc(statsRef, { userCount: increment(1) }, { merge: true });
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          }
        }
      });

      const unsubscribeStats = onSnapshot(doc(db, "stats", "global"), (snapshot) => {
        if (snapshot.exists()) {
          setUserCount(snapshot.data().userCount || 0);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "stats/global");
      });

      return () => {
        unsubscribeAuth();
        unsubscribeStats();
      };
    };

    let cleanup: any;
    setup().then(c => cleanup = c);
    return () => cleanup && cleanup();
  }, []);

  const login = async () => {
    try {
      const auth = getAuthClient();
      if (!auth) {
        setError("Firebase не настроен. Проверьте наличие firebase-applet-config.json в корне вашего сайта!");
        return;
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError("Ошибка входа через Google. Убедитесь, что домен вашего сайта добавлен в Authorized Domains в Firebase Console.");
    }
  };

  const logout = () => {
    const auth = getAuthClient();
    if (auth) signOut(auth);
  };

  const categories = Array.from(new Set(ASSET_LIBRARY.map(a => a.category).filter(Boolean))) as string[];
  const filteredAssets = ASSET_LIBRARY.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || asset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const generatePreview = async () => {
    if (!prompt.trim()) return;
    if (!ai) {
      setError("API ключ не настроен. Пожалуйста, добавьте VITE_GEMINI_API_KEY в переменные окружения.");
      return;
    }
    setState("previewing");
    setError(null);
    try {
      const mode = isKidMode ? "6th_grader" : "professional";
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `User request: ${prompt}\nSelected Assets: ${selectedAssets.join(", ")}`,
        config: {
          systemInstruction: SCRATCH_PREVIEW_PROMPT.replace("{MODE}", mode),
          responseMimeType: "application/json",
        },
      });
      
      let text = response.text || "{}";
      // Clean up markdown if present
      text = text.replace(/```json\n?/, "").replace(/\n?```/, "").trim();
      
      const data = JSON.parse(text);
      setPlan(data);
    } catch (err) {
      console.error("Preview error:", err);
      setError("Не удалось создать превью. Попробуй изменить запрос.");
      setState("idle");
    }
  };

  const generateFullProject = async () => {
    if (!ai) return;
    setState("generating");
    setError(null);
    try {
      const mode = isKidMode ? "6th_grader" : "professional";
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate full project.json for this plan: ${JSON.stringify(plan)}\nUser original prompt: ${prompt}`,
        config: {
          systemInstruction: SCRATCH_PROMPT_SYSTEM.replace("{MODE}", mode),
          responseMimeType: "application/json",
        },
      });
      
      let text = response.text || "{}";
      // Clean up markdown if present
      text = text.replace(/```json\n?/, "").replace(/\n?```/, "").trim();
      
      const data = JSON.parse(text);
      setProjectJson(data);
      setState("editing");
    } catch (err) {
      console.error("Generation error:", err);
      setError("Ошибка генерации. Пожалуйста, попробуй еще раз.");
      setState("previewing");
    }
  };

  const download = async () => {
    if (!projectJson) return;
    try {
      const blob = await createSb3File(projectJson, customAssets);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${plan?.title || "scratch-project"}.sb3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Download failed.");
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const svgContent = event.target?.result as string;
      const id = Math.random().toString(36).substring(7);
      const newAsset: ScratchAsset = {
        id,
        name: file.name.replace(".svg", ""),
        md5ext: `${id}.svg`,
        svg: svgContent,
        type: "sprite",
      };
      setCustomAssets([...customAssets, newAsset]);
      setSelectedAssets([...selectedAssets, id]);
    };
    reader.readAsText(file);
  };

  const toggleAsset = (id: string) => {
    setSelectedAssets(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-orange-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setState("idle")}>
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-200">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">
              Scratch <span className="text-orange-500">Studio AI</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.displayName || "Пользователь"}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{currentUser.email}</p>
                </div>
                {currentUser.photoURL && (
                  <img src={currentUser.photoURL} className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                )}
                <Button variant="ghost" size="icon" onClick={logout} title="Выйти">
                  <LogOut className="w-4 h-4 text-slate-400" />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={login} className="gap-2">
                <LogIn className="w-4 h-4" /> Войти
              </Button>
            )}
            {state === "editing" && (
              <Button size="sm" onClick={download} className="gap-2 bg-green-600 hover:bg-green-700">
                <Download className="w-4 h-4" /> Скачать .sb3
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="text-center mb-16 relative">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-10">
                  <Rocket className="w-32 h-32 text-orange-500 rotate-12" />
                </div>
                <h1 className="text-5xl font-black text-slate-900 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-orange-500">
                  Scratch AI Studio: Генератор проектов Скретч через ИИ
                </h1>
                <p className="text-slate-500 text-xl max-w-2xl mx-auto leading-relaxed">
                  Мы объединяем воображение и код. Опишите идею игры или алгоритма, выберите спрайты, а наш ИИ сгенерирует рабочую структуру для <span className="text-orange-500 font-bold">Scratch 3.0</span> мгновенно. Скачивайте готовый файл .sb3 и запускайте в редакторе!
                </p>
                <div className="flex items-center justify-center gap-8 mt-10">
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-orange-500">{userCount}+</span>
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">Участников</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-slate-800">100%</span>
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">Бесплатно</span>
                  </div>
                </div>
              </div>

              {!currentUser && (
                <Card className="mb-12 border-orange-200 bg-orange-50">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 text-orange-800">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-orange-100">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight text-orange-950">Присоединяйся к сообществу!</h4>
                        <p className="text-sm opacity-80">Войди, чтобы сохранять свои идеи и участвовать в рейтинге самых активных творцов.</p>
                      </div>
                    </div>
                    <Button onClick={login} className="bg-orange-500 hover:bg-orange-600 whitespace-nowrap gap-2">
                      <LogIn className="w-4 h-4" /> Войти через Google
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="grid lg:grid-cols-[1fr_350px] gap-8">
                <div className="space-y-8">
                  <Card className="shadow-xl border-slate-200/60 transition-shadow hover:shadow-2xl hover:shadow-orange-100">
                    <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-orange-500" /> Настройка Проекта
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="space-y-6">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-bold text-slate-700">Твой запрос</label>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[10px] font-black uppercase tracking-wider transition-colors", isKidMode ? "text-orange-500" : "text-slate-400")}>
                                Режим 6-классника
                              </span>
                              <button
                                onClick={() => setIsKidMode(!isKidMode)}
                                className={cn(
                                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                  isKidMode ? "bg-orange-500" : "bg-slate-200"
                                )}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    isKidMode ? "translate-x-4" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </div>
                          </div>
                          <Input 
                            placeholder={isKidMode ? "Напиши ченить прикольное..." : "Опиши игру (например: 'гоночный симулятор по городу')..."}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="h-16 text-lg rounded-xl border-slate-200 focus:ring-orange-500"
                          />
                        </div>

                        <div>
                          <div className="flex flex-col gap-4 mb-6">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Library className="w-4 h-4 text-orange-500" /> Выбор Спрайтов
                              </label>
                              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold uppercase tracking-widest h-8 gap-1">
                                <Upload className="w-3 h-3" /> Свой SVG
                              </Button>
                              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".svg" className="hidden" />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button 
                                variant={selectedCategory === null ? "primary" : "ghost"}
                                size="sm" 
                                onClick={() => setSelectedCategory(null)}
                                className="text-[10px] h-7"
                              >
                                Все
                              </Button>
                              {categories.map(cat => (
                                <Button 
                                  key={cat}
                                  variant={selectedCategory === cat ? "primary" : "ghost"}
                                  size="sm" 
                                  onClick={() => setSelectedCategory(cat)}
                                  className="text-[10px] h-7"
                                >
                                  {cat}
                                </Button>
                              ))}
                            </div>

                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input 
                                placeholder="Поиск спрайта..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-10 text-sm bg-slate-100/50 border-none rounded-lg"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[350px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-orange-200">
                            {[...filteredAssets, ...customAssets].map((asset) => (
                              <div 
                                key={asset.id}
                                onClick={() => toggleAsset(asset.id)}
                                className={cn(
                                  "relative p-3 rounded-xl border-2 cursor-pointer transition-all group overflow-hidden",
                                  selectedAssets.includes(asset.id) 
                                    ? "border-orange-500 bg-orange-50 shadow-md shadow-orange-100" 
                                    : "border-slate-100 bg-white hover:border-orange-200"
                                )}
                              >
                                <div className="aspect-square flex items-center justify-center mb-2 bg-white rounded-lg p-2 group-hover:scale-110 transition-transform">
                                  <div 
                                    dangerouslySetInnerHTML={{ __html: asset.svg }} 
                                    className="w-full h-full flex items-center justify-center" 
                                    aria-label={`Спрайт Scratch: ${asset.name}`}
                                    title={`Спрайт Scratch: ${asset.name}`}
                                  />
                                </div>
                                <p className="text-[10px] font-black text-center truncate uppercase tracking-wider text-slate-500 group-hover:text-orange-500">
                                  {asset.name}
                                </p>
                                {selectedAssets.includes(asset.id) && (
                                  <div className="absolute top-1 right-1 bg-orange-500 rounded-full p-0.5 shadow-sm">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <Button 
                          className="w-full h-16 text-lg font-black uppercase tracking-widest gap-2 bg-orange-500 hover:bg-orange-600 shadow-xl shadow-orange-200" 
                          onClick={currentUser ? generatePreview : login}
                          disabled={!prompt.trim() && currentUser}
                        >
                          {currentUser ? (
                            <>
                              <Wand2 className="w-6 h-6" /> Сгенерировать превью
                            </>
                          ) : (
                            <>
                              <LogIn className="w-6 h-6" /> Войти для создания
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                    {!currentUser && (
                      <div className="absolute inset-0 bg-slate-50/60 backdrop-blur-[2px] flex items-center justify-center p-6 z-10 rounded-xl">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl border border-orange-100 text-center max-w-xs animate-in zoom-in duration-300">
                          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck className="w-6 h-6 text-orange-500" />
                          </div>
                          <h4 className="font-black text-slate-900 mb-2">Доступ ограничен</h4>
                          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                            Чтобы использовать мощь ИИ для создания Scratch проектов, необходимо авторизоваться. Это бесплатно и безопасно.
                          </p>
                          <Button onClick={login} className="w-full gap-2">
                            <LogIn className="w-4 h-4" /> Войти через Google
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="bg-slate-900 text-white border-none shadow-2xl">
                      <CardHeader>
                        <h2 className="text-lg font-bold flex items-center gap-2 m-0 text-inherit">
                          <Info className="w-5 h-5 text-orange-400" /> Как это работает?
                        </h2>
                      </CardHeader>
                      <CardContent className="space-y-4 text-slate-300 text-sm">
                        <div className="flex gap-4">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-orange-400 border border-slate-700">1</div>
                          <div>
                            <div className="text-xs font-bold text-white mb-1 uppercase tracking-tighter">Сформулируйте алгоритм</div>
                            <p>Опишите свою идею обычными словами: кликер, гонки или квест.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-orange-400 border border-slate-700">2</div>
                          <div>
                            <div className="text-xs font-bold text-white mb-1 uppercase tracking-tighter">Выберите спрайты и фоны</div>
                            <p>Отметьте нужных героев в нашей библиотеке SVG-ассетов.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-orange-400 border border-slate-700">3</div>
                          <div>
                            <div className="text-xs font-bold text-white mb-1 uppercase tracking-tighter">Генерация кода блоков</div>
                            <p>ИИ построит архитектуру проекта, создаст переменные и скрипты.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-orange-400 border border-slate-700">4</div>
                          <div>
                            <div className="text-xs font-bold text-white mb-1 uppercase tracking-tighter">Скачать .sb3 файл</div>
                            <p>Загрузите готовый проект и запустите его в официальном Scratch Editor!</p>
                          </div>
                        </div>
                      </CardContent>
                  </Card>

                  <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Реклама</span>
                        <ExternalLink className="w-3 h-3 text-slate-300" />
                      </div>
                      <CardTitle className="text-sm font-bold">Профессиональные уроки Scratch</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500 mb-4">Освой сложные скрипты и анимацию за 4 недели под руководством экспертов.</p>
                      <img src="https://picsum.photos/seed/code/400/200" className="rounded-lg w-full h-24 object-cover mb-4" referrerPolicy="no-referrer" />
                      <Button variant="outline" className="w-full text-[10px] uppercase font-black" onClick={() => window.open('https://scratch.mit.edu/parents/', '_blank')}>Узнать больше</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <footer className="mt-24 pt-12 border-t border-slate-200 text-center space-y-8 pb-12">
                <div className="max-w-3xl mx-auto px-6 text-left space-y-6">
                  <h2 className="text-xl font-black text-slate-800 border-l-4 border-orange-500 pl-4 uppercase tracking-tight">Библиотека Скретч AI Studio</h2>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Наш бесплатный <strong>генератор проектов Скретч</strong> — это идеальный инструмент для детей, учителей и начинающих программистов. Мы используем передовые модели <strong>искусственного интеллекта</strong> (Google AI Studio), чтобы превратить ваш текстовый запрос в полноценный <strong>scratch проект</strong>. 
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Вы больше не ограничены базовыми знаниями — просто опишите логику, и сервис сам расставит <strong>блоки, скрипты, списки и циклы</strong>. В нашей коллекции доступны качественные <strong>спрайты, фоны и персонажи</strong>, сгруппированные по категориям: животные, транспорт, природа. Сервис поддерживает экспорт в формат <strong>.sb3</strong>, что делает его полностью совместимым с новой версией <strong>Scratch 3.0</strong>. Интегрированное <strong>машинное обучение</strong> помогает в считанные секунды создать сложные <strong>алгоритмы</strong> и прототипы игр.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto px-4 opacity-60">
                   {["алгоритмы", "ии скретч", "scratch ai", "скретч скрипты", "блоки кода", "sb3 скачать", "образование", "программирование", "уроки скретч", "спрайты скачать", "игры на скретч", "генератор кода", "визуальное программирование", "обучение айти", "scratch lab", "ai blocks", "coding for kids", "генератор sb3"].map(tag => (
                     <span key={tag} className="text-[10px] font-bold text-slate-400 lowercase bg-slate-100 px-2 py-1 rounded">#{tag}</span>
                   ))}
                </div>

                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                    <Gamepad2 className="w-4 h-4" /> Scratch AI Studio &copy; 2026
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-tighter">Нас уже: {userCount} участников</span>
                  </div>
                </div>
              </footer>
            </motion.div>
          )}

          {state === "previewing" && plan && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="max-w-4xl mx-auto"
            >
              <Button variant="ghost" onClick={() => setState("idle")} className="mb-6 gap-2">
                <ArrowLeft className="w-4 h-4" /> Назад к запросу
              </Button>

              <Card className="overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-3xl mb-2">{plan.title}</CardTitle>
                      <CardDescription className="text-base">План проекта от ИИ</CardDescription>
                    </div>
                    <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center">
                      <Eye className="text-orange-500 w-8 h-8" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  <div className="grid sm:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Library className="w-4 h-4 text-orange-500" /> Спрайты
                      </h4>
                      <ul className="space-y-2">
                        {plan.sprites.map((s, i) => (
                          <li key={i} className="flex items-center gap-2 text-slate-600 bg-slate-50 px-3 py-2 rounded-lg text-sm">
                            <ChevronRight className="w-3 h-3 text-orange-400" /> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Code className="w-4 h-4 text-orange-500" /> Переменные
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {plan.variables.map((v, i) => (
                          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-bold uppercase tracking-wide">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800">Описание логики</h4>
                    <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {plan.scriptsDescription}
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button variant="outline" className="flex-1 h-12" onClick={() => setState("idle")}>
                      Доработать запрос
                    </Button>
                    <Button className="flex-1 h-12 gap-2" onClick={generateFullProject}>
                      <Rocket className="w-5 h-5" /> Создать полный проект
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(state === "generating") && (
            <motion.div 
              key="loading"
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative w-24 h-24 mb-8">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Создаем проект...</h3>
              <p className="text-slate-500">ИИ пишет код блоков Scratch 3.0</p>
            </motion.div>
          )}

          {state === "editing" && projectJson && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid lg:grid-cols-[1fr_400px] gap-6"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Code className="w-5 h-5 text-orange-500" /> Редактор project.json
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setState("previewing")} className="gap-1">
                      <ArrowLeft className="w-3 h-3" /> Назад
                    </Button>
                    <Button size="sm" onClick={download} className="gap-1">
                      <Save className="w-3 h-3" /> Сохранить и Скачать
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">SCRATCH_PROJECT_JSON</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Read & Write</span>
                  </div>
                  <div className="max-h-[600px] overflow-auto font-mono text-sm leading-relaxed p-4">
                    <Editor
                      value={JSON.stringify(projectJson, null, 2)}
                      onValueChange={code => {
                        try {
                          setProjectJson(JSON.parse(code));
                        } catch(e) {}
                      }}
                      highlight={code => Prism.highlight(code, Prism.languages.json, "json")}
                      padding={10}
                      className="min-h-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Инструкция</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-slate-600">
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100 text-orange-800">
                      <p className="font-bold mb-1 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" /> Важно!
                      </p>
                      Вы редактируете сырой JSON проекта. Будьте осторожны с синтаксисом.
                    </div>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>Отредактируйте JSON если нужно.</li>
                      <li>Нажмите <b>Скачать .sb3</b>.</li>
                      <li>Откройте <a href="https://scratch.mit.edu/projects/editor/" target="_blank" className="text-orange-500 underline">Scratch Editor</a>.</li>
                      <li>Выберите <b>File &rarr; Load from your computer</b>.</li>
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Статус проекта</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span>Спрайтов:</span>
                      <span className="text-orange-500 font-bold">{projectJson.targets?.filter((t: any) => !t.isStage).length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Блоков всего:</span>
                      <span className="text-orange-500 font-bold">
                        {projectJson.targets?.reduce((acc: number, t: any) => acc + Object.keys(t.blocks || {}).length, 0)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">{error}</span>
              <button onClick={() => setError(null)} className="hover:opacity-70">×</button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

