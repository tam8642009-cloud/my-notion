import React, { useState, useRef, useEffect, useCallback } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs
} from "firebase/firestore";

const EMOJI_LIST = ["📄","📝","📊","🗂️","💡","🔖","🎯","📌"];
function genId() { return Math.random().toString(36).slice(2,9); }
function nowTime() { return new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}); }

function parseExcelPaste(text) {
  const rows = text.trim().split("\n").map(r => r.split("\t"));
  if (rows.length < 1 || (rows.length === 1 && rows[0].length < 2)) return null;
  const headers = rows[0].map((h,i) => h.trim() || `列${i+1}`);
  const dataRows = rows.slice(1).map(r => { while(r.length < headers.length) r.push(""); return r.map(c=>c.trim()); });
  if (dataRows.length === 0) dataRows.push(headers.map(()=>""));
  return { id:genId(), type:"table", headers, rows:dataRows };
}

function TableBlock({ block, onChange }) {
  const rows = block.rows || [["",""],["",""]];
  const headers = block.headers || ["列1","列2"];
  const [menu, setMenu] = useState(null);
  const longPressTimer = useRef(null);

  const update = (r,c,v) => { const nr=rows.map((row,ri)=>ri===r?row.map((cell,ci)=>ci===c?v:cell):row); onChange({...block,rows:nr,headers}); };
  const updateH = (c,v) => { const nh=headers.map((h,i)=>i===c?v:h); onChange({...block,rows,headers:nh}); };
  const addRow = () => onChange({...block,rows:[...rows,headers.map(()=>"")],headers});
  const addCol = () => { const nh=[...headers,`列${headers.length+1}`]; onChange({...block,rows:rows.map(r=>[...r,""]),headers:nh}); };
  const deleteRow = r => { if(rows.length<=1) return; onChange({...block,rows:rows.filter((_,i)=>i!==r),headers}); setMenu(null); };
  const insertRow = (r,offset) => { const nr=[...rows]; nr.splice(r+offset,0,headers.map(()=>"")); onChange({...block,rows:nr,headers}); setMenu(null); };

  const handleRowContext = (e,r) => { e.preventDefault(); setMenu({rowIndex:r,x:e.clientX,y:e.clientY}); };
  const handleTouchStart = (e,r) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(()=>setMenu({rowIndex:r,x:touch.clientX,y:touch.clientY}), 500);
  };
  const handleTouchEnd = () => clearTimeout(longPressTimer.current);

  useEffect(()=>{
    const close = ()=>setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("touchstart", close);
    return ()=>{ window.removeEventListener("click",close); window.removeEventListener("touchstart",close); };
  },[]);

  return (
    <div style={{overflowX:"auto",margin:"8px 0",position:"relative"}}>
      {menu&&(
        <div onClick={e=>e.stopPropagation()}
          style={{position:"fixed",top:menu.y,left:menu.x,background:"#fff",border:"1px solid #e0e0e0",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:300,overflow:"hidden",minWidth:160}}>
          <div onClick={()=>insertRow(menu.rowIndex,0)} style={{padding:"10px 16px",cursor:"pointer",fontSize:13,color:"#37352f",borderBottom:"1px solid #f0f0ef"}}>↑ 上に行を追加</div>
          <div onClick={()=>insertRow(menu.rowIndex,1)} style={{padding:"10px 16px",cursor:"pointer",fontSize:13,color:"#37352f",borderBottom:"1px solid #f0f0ef"}}>↓ 下に行を追加</div>
          <div onClick={()=>deleteRow(menu.rowIndex)} style={{padding:"10px 16px",cursor:"pointer",fontSize:13,color:"#e03e3e"}}>🗑 この行を削除</div>
        </div>
      )}
      <table style={{borderCollapse:"collapse",width:"100%",fontSize:14}}>
        <thead><tr>
          <th style={{border:"1px solid #e0e0e0",background:"#f7f6f3",width:20}}></th>
          {headers.map((h,c)=>(
            <th key={c} style={{border:"1px solid #e0e0e0",padding:0,background:"#f7f6f3",minWidth:100}}>
              <input value={h} onChange={e=>updateH(c,e.target.value)}
                style={{width:"100%",border:"none",background:"transparent",padding:"6px 8px",fontWeight:600,fontSize:13,outline:"none",color:"#37352f"}}/>
            </th>
          ))}
          <th style={{border:"1px solid #e0e0e0",background:"#f7f6f3",width:32}}>
            <button onClick={addCol} style={{border:"none",background:"none",cursor:"pointer",color:"#9b9a97",fontSize:16,padding:"2px 4px"}}>+</button>
          </th>
        </tr></thead>
        <tbody>{rows.map((row,r)=>(
          <tr key={r}>
            <td onContextMenu={e=>handleRowContext(e,r)} onTouchStart={e=>handleTouchStart(e,r)} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
              style={{border:"1px solid #e0e0e0",background:"#f7f6f3",cursor:"context-menu",textAlign:"center",fontSize:10,color:"#c4c4c0",userSelect:"none",padding:"0 4px"}}>⠿</td>
            {row.map((cell,c)=>(
              <td key={c} style={{border:"1px solid #e0e0e0",padding:0}}>
                <input value={cell} onChange={e=>update(r,c,e.target.value)}
                  style={{width:"100%",border:"none",padding:"6px 8px",fontSize:13,outline:"none",color:"#37352f",background:"transparent"}}/>
              </td>
            ))}
            <td style={{border:"1px solid #e0e0e0"}}></td>
          </tr>
        ))}</tbody>
      </table>
      <button onClick={addRow} style={{marginTop:4,border:"none",background:"none",cursor:"pointer",color:"#9b9a97",fontSize:13,padding:"4px 8px"}}>+ 行を追加</button>
    </div>
  );
}

function TextBlock({ block, onChange, onKeyDown }) {
  const ref = useRef();
  const composing = useRef(false);
  const isUpdating = useRef(false);

  useEffect(()=>{
    if(ref.current && !isUpdating.current){
      const lines = block.content.split("\n");
      ref.current.innerHTML = lines.map(l=>
        `<div>${l===""?"<br>":escHtml(l)}</div>`
      ).join("");
    }
  },[block.content]);

  const escHtml = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  const getPlainText = () => {
    if(!ref.current) return "";
    return Array.from(ref.current.children)
      .map(div=>{
        if(div.querySelector("br")&&div.textContent==="") return "";
        return div.textContent;
      }).join("\n");
  };

  const handleInput = () => {
    if(composing.current) return;
    isUpdating.current = true;
    onChange({...block, content: getPlainText()});
    setTimeout(()=>{ isUpdating.current=false; },50);
  };

  const handleKeyDown = (e) => {
    if(e.key==="Enter"&&!e.shiftKey){
      e.preventDefault();
      // 新しいブロックを追加
      onKeyDown && onKeyDown(e);
    }
  };

  const insertNewline = () => {
    if(!ref.current) return;
    ref.current.focus();
    document.execCommand("insertHTML", false, "<br><br>");
    isUpdating.current = true;
    onChange({...block, content: getPlainText()});
    setTimeout(()=>{ isUpdating.current=false; },50);
  };

  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:4,margin:"2px 0"}}>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={()=>composing.current=true}
        onCompositionEnd={()=>{ composing.current=false; handleInput(); }}
        onKeyDown={handleKeyDown}
        style={{flex:1,border:"none",outline:"none",fontSize:16,color:"#37352f",lineHeight:1.5,fontFamily:"inherit",background:"transparent",padding:"2px 0",wordBreak:"break-word",minHeight:"24px"}}/>
      <button onMouseDown={e=>e.preventDefault()} onClick={insertNewline}
        title="改行を挿入"
        style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"#c4c4c0",fontSize:16,padding:"2px 2px",lineHeight:1,marginTop:2}}>↵</button>
    </div>
  );
}

function PageEditor({ page, onUpdate }) {
  const [title,setTitle] = useState(page.title);
  const [emoji,setEmoji] = useState(page.emoji);
  const [blocks,setBlocks] = useState(page.blocks);
  const [showEmoji,setShowEmoji] = useState(false);
  const [addMenu,setAddMenu] = useState(false);
  const [pasteMsg,setPasteMsg] = useState("");
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  useEffect(()=>{
    setTitle(page.title); setEmoji(page.emoji); setBlocks(page.blocks);
  },[page.id, page.title, page.emoji, page.blocks]);

  const save = useCallback((t,e,b) => onUpdate({...page,title:t,emoji:e,blocks:b}), [page,onUpdate]);

  const updateBlock = (id,nb) => {
    setBlocks(prev=>{ const b2=prev.map(b=>b.id===id?nb:b); save(title,emoji,b2); return b2; });
  };
  const addBlock = type => {
    const nb = type==="table"
      ? {id:genId(),type:"table",headers:["列1","列2"],rows:[["",""],["",""]]}
      : {id:genId(),type:"text",content:""};
    setBlocks(prev=>{ const b2=[...prev,nb]; save(title,emoji,b2); return b2; });
    setAddMenu(false);
  };
  const deleteBlock = id => {
    setBlocks(prev=>{ const b2=prev.filter(b=>b.id!==id); save(title,emoji,b2); return b2; });
  };
  const handleKey = (e,id) => {
    if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); addBlock("text"); }
    if(e.key==="Backspace"&&blocks.find(b=>b.id===id)?.content===""){ e.preventDefault(); deleteBlock(id); }
  };
  const onDragStart = i => { dragItem.current=i; };
  const onDragEnter = i => { dragOver.current=i; };
  const onDragEnd = () => {
    setBlocks(prev=>{
      const b2=[...prev];
      const dragged=b2.splice(dragItem.current,1)[0];
      b2.splice(dragOver.current,0,dragged);
      dragItem.current=null; dragOver.current=null;
      save(title,emoji,b2); return b2;
    });
  };
  const handlePaste = useCallback((e) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return;
    const tbl = parseExcelPaste(text);
    if (!tbl) return;
    e.preventDefault();
    setBlocks(prev=>{ const b2=[...prev,tbl]; save(title,emoji,b2); return b2; });
    setPasteMsg("✅ Excelの表を貼り付けました");
    setTimeout(()=>setPasteMsg(""),2500);
  },[title,emoji,save]);

  useEffect(()=>{
    document.addEventListener("paste",handlePaste);
    return ()=>document.removeEventListener("paste",handlePaste);
  },[handlePaste]);

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"60px 40px 40px"}}>
      {pasteMsg&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#37352f",color:"#fff",padding:"8px 20px",borderRadius:8,fontSize:13,zIndex:200,boxShadow:"0 4px 12px rgba(0,0,0,0.2)"}}>{pasteMsg}</div>}
      <div style={{position:"relative",display:"inline-block",marginBottom:8}}>
        <span style={{fontSize:40,cursor:"pointer",userSelect:"none"}} onClick={()=>setShowEmoji(v=>!v)}>{emoji}</span>
        {showEmoji&&(
          <div style={{position:"absolute",top:48,left:0,background:"#fff",border:"1px solid #e0e0e0",borderRadius:8,padding:8,display:"flex",flexWrap:"wrap",gap:4,zIndex:100,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
            {EMOJI_LIST.map(em=><span key={em} style={{fontSize:24,cursor:"pointer",padding:4,borderRadius:4}} onClick={()=>{setEmoji(em);save(title,em,blocks);setShowEmoji(false);}}>{em}</span>)}
          </div>
        )}
      </div>
      <input value={title} onChange={e=>{setTitle(e.target.value);save(e.target.value,emoji,blocks);}} placeholder="タイトルなし"
        style={{display:"block",width:"100%",border:"none",outline:"none",fontSize:36,fontWeight:700,color:"#37352f",fontFamily:"inherit",background:"transparent",marginBottom:16,padding:0}}/>
      {blocks.map((b,i)=>(
        <div key={b.id} draggable
          onDragStart={()=>onDragStart(i)} onDragEnter={()=>onDragEnter(i)} onDragEnd={onDragEnd} onDragOver={e=>e.preventDefault()}
          style={{position:"relative",paddingRight:24,paddingLeft:24,marginBottom:0,borderRadius:6}}
          onMouseOver={e=>{e.currentTarget.querySelector(".del-btn").style.opacity=1;e.currentTarget.querySelector(".drag-handle").style.opacity=1;}}
          onMouseOut={e=>{e.currentTarget.querySelector(".del-btn").style.opacity=0;e.currentTarget.querySelector(".drag-handle").style.opacity=0;}}>
          <span className="drag-handle" style={{position:"absolute",left:0,top:6,opacity:0,cursor:"grab",fontSize:14,color:"#c4c4c0",padding:"2px 4px",userSelect:"none",transition:"opacity 0.1s"}}>⠿</span>
          {b.type==="text"&&<TextBlock block={b} onChange={nb=>updateBlock(b.id,nb)} onKeyDown={e=>handleKey(e,b.id)}/>}
          {b.type==="table"&&<TableBlock block={b} onChange={nb=>updateBlock(b.id,nb)}/>}
          <span className="del-btn" onClick={()=>deleteBlock(b.id)} style={{position:"absolute",top:4,right:0,opacity:0,cursor:"pointer",fontSize:13,color:"#9b9a97",padding:"2px 4px",borderRadius:4,transition:"opacity 0.1s"}}>✕</span>
        </div>
      ))}
      <div style={{marginTop:16,position:"relative"}}>
        <button onClick={()=>setAddMenu(v=>!v)} style={{border:"none",background:"none",cursor:"pointer",color:"#9b9a97",fontSize:14,padding:"4px 8px",borderRadius:4,display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:18,fontWeight:300}}>+</span> ブロックを追加
        </button>
        {addMenu&&(
          <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#fff",border:"1px solid #e0e0e0",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:100,overflow:"hidden",minWidth:200}}>
            {[["text","📝 テキスト"],["table","📊 テーブル"]].map(([t,label])=>(
              <div key={t} onClick={()=>addBlock(t)} onTouchEnd={e=>{e.preventDefault();addBlock(t);}}
                style={{padding:"16px 24px",cursor:"pointer",fontSize:16,color:"#37352f",borderBottom:"1px solid #f0f0ef"}}>{label}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{marginTop:24,padding:"12px 16px",background:"#f7f6f3",borderRadius:8,fontSize:12,color:"#9b9a97"}}>
        💡 Excelの表をコピーして、このページ上でそのまま貼り付けるとテーブルになります
      </div>
    </div>
  );
}

function Chat({ roomCode, rooms, setRooms }) {
  const [activeRoom,setActiveRoom]=useState(rooms[0]?.id);
  const [input,setInput]=useState("");
  const [username,setUsername]=useState("あなた");
  const [newRoom,setNewRoom]=useState("");
  const endRef=useRef();
  const room=rooms.find(r=>r.id===activeRoom);

  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[room?.messages?.length]);

  const saveRoom = async (updatedRoom) => {
    const ref = doc(db,"workspaces",roomCode,"rooms",updatedRoom.id);
    await setDoc(ref,{ name:updatedRoom.name, messages:updatedRoom.messages });
  };

  const send=()=>{
    if(!input.trim()) return;
    const msg={id:genId(),user:username,text:input.trim(),time:nowTime()};
    const updated={...room,messages:[...room.messages,msg]};
    setRooms(prev=>prev.map(r=>r.id===activeRoom?updated:r));
    saveRoom(updated);
    setInput("");
  };
  const addRoom=async()=>{
    if(!newRoom.trim()) return;
    const r={id:genId(),name:newRoom.trim(),messages:[]};
    setRooms(prev=>[...prev,r]);
    await saveRoom(r);
    setActiveRoom(r.id); setNewRoom("");
  };

  return (
    <div style={{display:"flex",height:"100%"}}>
      <div style={{width:160,borderRight:"1px solid #e0e0e0",padding:"12px 0",background:"#f7f6f3",flexShrink:0}}>
        <div style={{padding:"0 12px 8px",fontSize:11,fontWeight:600,color:"#9b9a97",letterSpacing:"0.05em"}}>チャンネル</div>
        {rooms.map(r=>(
          <div key={r.id} onClick={()=>setActiveRoom(r.id)}
            style={{padding:"6px 12px",cursor:"pointer",fontSize:14,color:r.id===activeRoom?"#37352f":"#6b6b6b",background:r.id===activeRoom?"#e9e9e8":"transparent",borderRadius:4,margin:"0 4px"}}># {r.name}</div>
        ))}
        <div style={{padding:"8px 12px 0",borderTop:"1px solid #e0e0e0",marginTop:8}}>
          <input value={newRoom} onChange={e=>setNewRoom(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRoom()} placeholder="+ 新しいルーム"
            style={{width:"100%",border:"1px solid #e0e0e0",borderRadius:4,padding:"4px 6px",fontSize:12,outline:"none",color:"#37352f",background:"#fff",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e0e0e0",fontWeight:600,fontSize:15,color:"#37352f"}}># {room?.name}</div>
        <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
          {room?.messages.map(m=>(
            <div key={m.id} style={{marginBottom:12}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span style={{fontWeight:600,fontSize:14,color:"#37352f"}}>{m.user}</span>
                <span style={{fontSize:11,color:"#9b9a97"}}>{m.time}</span>
              </div>
              <div style={{fontSize:14,color:"#37352f",marginTop:2,lineHeight:1.5}}>{m.text}</div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid #e0e0e0",display:"flex",gap:8,alignItems:"center"}}>
          <input value={username} onChange={e=>setUsername(e.target.value)} style={{width:80,border:"1px solid #e0e0e0",borderRadius:6,padding:"8px 10px",fontSize:13,outline:"none",color:"#37352f",flexShrink:0}} placeholder="名前"/>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={`# ${room?.name} にメッセージを送る`}
            style={{flex:1,border:"1px solid #e0e0e0",borderRadius:6,padding:"8px 12px",fontSize:14,outline:"none",color:"#37352f"}}/>
          <button onClick={send} style={{background:"#2eaadc",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",cursor:"pointer",fontSize:14,fontWeight:600,flexShrink:0}}>送信</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [shake,setShake]=useState(false);
  const handle=()=>{
    if(username==="Rs08"&&password==="ribc2026school"){ onAuth(); return; }
    setErr("Authorization Required");
    setShake(true); setTimeout(()=>setShake(false),600);
  };
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#1a1a2e",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif"}}>
      <div style={{background:"#16213e",borderRadius:12,padding:"40px 48px",boxShadow:"0 8px 32px rgba(0,0,0,0.4)",minWidth:360,textAlign:"center",border:"1px solid #0f3460",animation:shake?"shake 0.5s":"none"}}>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
        <div style={{fontSize:36,marginBottom:8}}>🔒</div>
        <h2 style={{margin:"0 0 4px",fontSize:20,color:"#e0e0e0"}}>このサイトにアクセスするにはサインインしてください</h2>
        <p style={{margin:"0 0 28px",color:"#6b7280",fontSize:13}}>MyNotion — 認証が必要です</p>
        <div style={{textAlign:"left",marginBottom:12}}>
          <label style={{fontSize:12,color:"#9b9a97",display:"block",marginBottom:4}}>ユーザー名</label>
          <input value={username} onChange={e=>setUsername(e.target.value)}
            style={{width:"100%",boxSizing:"border-box",border:"1px solid #0f3460",borderRadius:6,padding:"10px 14px",fontSize:14,outline:"none",color:"#e0e0e0",background:"#0f3460"}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:16}}>
          <label style={{fontSize:12,color:"#9b9a97",display:"block",marginBottom:4}}>パスワード</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
            style={{width:"100%",boxSizing:"border-box",border:"1px solid #0f3460",borderRadius:6,padding:"10px 14px",fontSize:14,outline:"none",color:"#e0e0e0",background:"#0f3460"}}/>
        </div>
        {err&&<div style={{background:"#3b0a0a",border:"1px solid #e03e3e",borderRadius:6,padding:"10px 14px",marginBottom:16,color:"#e03e3e",fontSize:13,fontWeight:600}}>🚫 {err}</div>}
        <button onClick={handle} style={{width:"100%",background:"#e94560",color:"#fff",border:"none",borderRadius:6,padding:"11px 0",fontSize:15,fontWeight:600,cursor:"pointer"}}>サインイン</button>
      </div>
    </div>
  );
}

function JoinScreen({ onJoin }) {
  const genCode=()=>{const s="abcdefghijklmnopqrstuvwxyz0123456789";const seg=()=>Array.from({length:4},()=>s[Math.floor(Math.random()*s.length)]).join("");return `${seg()}-${seg()}-${seg()}-${seg()}`;};
  const [code,setCode]=useState(genCode);
  const [name,setName]=useState("");
  const [err,setErr]=useState("");
  const handle=()=>{
    if(name.trim().length<1){setErr("名前を入力してください");return;}
    if(code.trim().length<3){setErr("コードは3文字以上入力してください");return;}
    onJoin(code.trim().toLowerCase(),name.trim());
  };
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f7f6f3",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:12,padding:"40px 48px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)",minWidth:360,textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:8}}>🗒️</div>
        <h2 style={{margin:"0 0 4px",fontSize:22,color:"#37352f"}}>MyNotion</h2>
        <p style={{margin:"0 0 28px",color:"#9b9a97",fontSize:14}}>参加コードを入力してワークスペースに参加</p>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="あなたの名前"
          style={{width:"100%",boxSizing:"border-box",border:"1px solid #e0e0e0",borderRadius:6,padding:"10px 14px",fontSize:14,outline:"none",color:"#37352f",marginBottom:10}}/>
        <input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="例: x7k2-mq9p-wj4r-9z3q"
          style={{width:"100%",boxSizing:"border-box",border:"1px solid #e0e0e0",borderRadius:6,padding:"10px 14px",fontSize:14,outline:"none",color:"#37352f",marginBottom:4}}/>
        {err&&<p style={{color:"#e03e3e",fontSize:12,margin:"0 0 8px",textAlign:"left"}}>{err}</p>}
        <p style={{fontSize:11,color:"#9b9a97",margin:"0 0 16px",textAlign:"left"}}>参加コードは管理者から受け取ってください。</p>
        <button onClick={handle} style={{width:"100%",background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"11px 0",fontSize:15,fontWeight:600,cursor:"pointer"}}>参加する</button>
      </div>
    </div>
  );
}

export default function App() {
  const [authed,setAuthed]=useState(false);
  const [joined,setJoined]=useState(false);
  const [roomCode,setRoomCode]=useState("");
  const [username,setUsername]=useState("");
  const [pages,setPages]=useState([]);
  const [pageOrder,setPageOrder]=useState([]); // ページ順序だけ別管理
  const [rooms,setRooms]=useState([]);
  const [activePage,setActivePage]=useState(null);
  const [view,setView]=useState("page");
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const saveTimers=useRef({});
  const pageDragItem=useRef(null);
  const pageDragOver=useRef(null);
  const pageDragging=useRef(false);
  const pageTouchItem=useRef(null);
  const pageTouchTimer=useRef(null);

  // ページ一覧とページ順序をリッスン
  useEffect(()=>{
    if(!joined) return;
    const wsRef = doc(db,"workspaces",roomCode);

    // ワークスペースメタ（ページ順序）
    const unsubMeta = onSnapshot(wsRef, snap=>{
      if(snap.exists() && snap.data().pageOrder){
        setPageOrder(snap.data().pageOrder);
      }
    });

    // ページサブコレクション
    const unsubPages = onSnapshot(collection(db,"workspaces",roomCode,"pages"), snap=>{
      const loaded = snap.docs.map(d=>deserializePage({id:d.id,...d.data()}));
      setPages(loaded);
      setActivePage(ap => ap || loaded[0]?.id || null);
    });

    // チャットサブコレクション
    const unsubRooms = onSnapshot(collection(db,"workspaces",roomCode,"rooms"), snap=>{
      if(snap.empty){
        // 初期チャットルーム作成
        const r={id:"r1",name:"一般",messages:[]};
        setDoc(doc(db,"workspaces",roomCode,"rooms","r1"),{name:"一般",messages:[]});
        setRooms([r]);
      } else {
        setRooms(snap.docs.map(d=>({id:d.id,...d.data()})));
      }
    });

    return ()=>{ unsubMeta(); unsubPages(); unsubRooms(); };
  },[joined,roomCode]);

  // ページ順序をFirestoreに保存
  const savePageOrder = useCallback(async (order) => {
    await setDoc(doc(db,"workspaces",roomCode),{pageOrder:order},{merge:true});
  },[roomCode]);

  // ページ1件をFirestoreに保存（デバウンス）
  // Firestoreは二次元配列不可 → rows を {cells:[...]} に変換
  const serializePage = (page) => ({
    ...page,
    blocks: page.blocks.map(b =>
      b.type === "table"
        ? {...b, rows: b.rows.map(r => ({cells: r}))}
        : b
    )
  });
  const deserializePage = (data) => ({
    ...data,
    blocks: (data.blocks||[]).map(b =>
      b.type === "table"
        ? {...b, rows: (b.rows||[]).map(r => Array.isArray(r) ? r : (r.cells||[]))}
        : b
    )
  });

  const savePage = useCallback((page) => {
    if(saveTimers.current[page.id]) clearTimeout(saveTimers.current[page.id]);
    saveTimers.current[page.id] = setTimeout(async ()=>{
      const {id,...data} = serializePage(page);
      await setDoc(doc(db,"workspaces",roomCode,"pages",id), data);
    }, 800);
  },[roomCode]);

  const updatePage = (p) => {
    setPages(prev=>prev.map(pg=>pg.id===p.id?p:pg));
    savePage(p);
  };

  const addPage = async () => {
    const p={id:genId(),emoji:"📄",title:"新しいページ",blocks:[{id:genId(),type:"text",content:""}]};
    const {id,...data}=p;
    await setDoc(doc(db,"workspaces",roomCode,"pages",id),data);
    const newOrder=[...pageOrder,id];
    setPageOrder(newOrder);
    await savePageOrder(newOrder);
    setPages(prev=>[...prev,p]);
    setActivePage(id); setView("page");
  };

  const deletePage = async (id) => {
    await deleteDoc(doc(db,"workspaces",roomCode,"pages",id));
    const newOrder=pageOrder.filter(oid=>oid!==id);
    setPageOrder(newOrder);
    await savePageOrder(newOrder);
    setPages(prev=>prev.filter(p=>p.id!==id));
    if(activePage===id) setActivePage(newOrder[0]||null);
  };

  const duplicatePage = async (id) => {
    const src=pages.find(p=>p.id===id); if(!src) return;
    const newId=genId();
    const np2={...src,id:newId,title:src.title+" のコピー",blocks:src.blocks.map(b=>({...b,id:genId()}))};
    const {id:_,...data} = serializePage(np2);
    await setDoc(doc(db,"workspaces",roomCode,"pages",newId),{...data});
    const newOrder=[...pageOrder,newId];
    setPageOrder(newOrder);
    await savePageOrder(newOrder);
    setPages(prev=>[...prev,np2]);
    setActivePage(newId); setView("page");
  };

  // ページ順序に従って並び替え
  const orderedPages = pageOrder.length > 0
    ? pageOrder.map(id=>pages.find(p=>p.id===id)).filter(Boolean)
    : pages;

  const handleJoin=(code,name)=>{ setRoomCode(code); setUsername(name); setJoined(true); };
  const curPage=pages.find(p=>p.id===activePage);

  if(!authed) return <AuthScreen onAuth={()=>setAuthed(true)}/>;
  if(!joined) return <JoinScreen onJoin={handleJoin}/>;

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif",background:"#fff",color:"#37352f"}}>
      {sidebarOpen&&(
        <div style={{width:240,background:"#f7f6f3",borderRight:"1px solid #e0e0e0",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #e0e0e0"}}>
            <div style={{fontWeight:700,fontSize:15,color:"#37352f",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:18}}>🗒️</span> MyNotion
            </div>
            <div style={{fontSize:11,color:"#9b9a97",marginTop:4,display:"flex",alignItems:"center",gap:4}}>
              🔑 {roomCode}
              <span style={{marginLeft:"auto",cursor:"pointer",background:"#e9e9e8",borderRadius:4,padding:"1px 6px",fontSize:11,color:"#37352f"}} onClick={()=>setJoined(false)}>退出</span>
            </div>
          </div>
          <div style={{padding:"8px 8px 0"}}>
            <div onClick={()=>setView("chat")} style={{padding:"6px 12px",borderRadius:4,cursor:"pointer",fontSize:14,color:view==="chat"?"#37352f":"#6b6b6b",background:view==="chat"?"#e9e9e8":"transparent"}}>
              💬 チャット
            </div>
          </div>
          <div style={{padding:"8px 8px 0",flex:1,overflowY:"auto"}}>
            <div style={{padding:"4px 12px",fontSize:11,fontWeight:600,color:"#9b9a97",letterSpacing:"0.05em"}}>ページ</div>
            {orderedPages.map((p,i)=>(
              <div key={p.id} draggable
                onDragStart={e=>{e.dataTransfer.effectAllowed="move";pageDragItem.current=i;}}
                onDragEnter={()=>pageDragOver.current=i}
                onDragEnd={()=>{
                  if(pageDragItem.current===null||pageDragOver.current===null) return;
                  const newOrd=[...pageOrder];
                  const fromId=orderedPages[pageDragItem.current]?.id;
                  const toId=orderedPages[pageDragOver.current]?.id;
                  const fi=newOrd.indexOf(fromId); const ti=newOrd.indexOf(toId);
                  if(fi>=0&&ti>=0){ newOrd.splice(fi,1); newOrd.splice(ti,0,fromId); }
                  pageDragItem.current=null; pageDragOver.current=null;
                  setPageOrder(newOrd); savePageOrder(newOrd);
                }}
                onDragOver={e=>e.preventDefault()}
                onTouchStart={e=>{ pageTouchItem.current=i; pageTouchTimer.current=setTimeout(()=>{pageDragging.current=true;},300); }}
                onTouchMove={e=>{ if(!pageDragging.current) return; const t=e.touches[0]; const el=document.elementFromPoint(t.clientX,t.clientY)?.closest("[data-pageidx]"); if(el) pageDragOver.current=parseInt(el.dataset.pageidx); }}
                onTouchEnd={()=>{ clearTimeout(pageTouchTimer.current); if(pageDragging.current&&pageDragOver.current!=null&&pageTouchItem.current!=null){ const newOrd=[...pageOrder]; const fromId=orderedPages[pageTouchItem.current]?.id; const toId=orderedPages[pageDragOver.current]?.id; const fi=newOrd.indexOf(fromId); const ti=newOrd.indexOf(toId); if(fi>=0&&ti>=0){newOrd.splice(fi,1);newOrd.splice(ti,0,fromId);} setPageOrder(newOrd); savePageOrder(newOrd); } pageDragging.current=false; pageTouchItem.current=null; pageDragOver.current=null; }}
                data-pageidx={i}
                style={{padding:"5px 12px",borderRadius:4,cursor:"grab",fontSize:14,color:activePage===p.id&&view==="page"?"#37352f":"#6b6b6b",background:activePage===p.id&&view==="page"?"#e9e9e8":"transparent",display:"flex",alignItems:"center",justifyContent:"space-between"}}
                onClick={()=>{setActivePage(p.id);setView("page");}}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.emoji} {p.title||"タイトルなし"}</span>
                <span style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:4}}>
                  <span onClick={e=>{e.stopPropagation();duplicatePage(p.id);}} title="複製" style={{color:"#9b9a97",fontSize:13,padding:"1px 3px",cursor:"pointer",borderRadius:3}}>⧉</span>
                  <span onClick={e=>{e.stopPropagation();deletePage(p.id);}} title="削除" style={{color:"#9b9a97",fontSize:13,padding:"1px 3px",cursor:"pointer",borderRadius:3}}>✕</span>
                </span>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 8px",borderTop:"1px solid #e0e0e0"}}>
            <button onClick={addPage} style={{width:"100%",padding:"8px 0",background:"#fff",border:"1px solid #e0e0e0",borderRadius:6,cursor:"pointer",fontSize:14,color:"#37352f",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              ＋ 新しいページ
            </button>
          </div>
        </div>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{height:44,borderBottom:"1px solid #e0e0e0",display:"flex",alignItems:"center",padding:"0 16px",gap:8,flexShrink:0}}>
          <button onClick={()=>setSidebarOpen(v=>!v)} style={{border:"none",background:"none",cursor:"pointer",color:"#9b9a97",fontSize:16,padding:"4px 6px",borderRadius:4}}>☰</button>
          <span style={{fontSize:13,color:"#9b9a97",flex:1}}>
            {view==="chat"?"💬 チャット":curPage?`${curPage.emoji} ${curPage.title||"タイトルなし"}`:""}
          </span>
          <span style={{fontSize:12,color:"#9b9a97"}}>👤 {username}</span>
        </div>
        <div style={{flex:1,overflow:"auto"}}>
          {view==="page"&&curPage&&<PageEditor page={curPage} onUpdate={updatePage}/>}
          {view==="chat"&&<Chat roomCode={roomCode} rooms={rooms} setRooms={setRooms}/>}
          {view==="page"&&!curPage&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9b9a97",fontSize:16}}>
              ページを選択するか、新しいページを作成してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
