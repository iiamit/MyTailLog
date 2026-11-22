"""Generate ElevenLabs male narration + real alignment captions. Key stays outside repo.

Set ELEVENLABS_CONFIG if the protected env file is not at the default path.
Free-plan output is noncommercial only and requires ElevenLabs title attribution.
"""
import base64,json,os,subprocess
from pathlib import Path
import requests
from build_media import ROOT,REEL,SCENES,FFMPEG
cfg=Path(os.environ.get('ELEVENLABS_CONFIG',Path.home()/'.config/mytaillog/elevenlabs.env'))
values={}
for line in cfg.read_text().splitlines():
 line=line.strip().removeprefix('export ')
 if '=' in line:
  k,v=line.split('=',1);values[k]=v.strip().strip('\"\'')
key=values.get('ELEVENLABS_API_KEY') or values.get('XI_API_KEY')
if not key and len(values)==1:key=next(iter(values.values()))
if not key:raise SystemExit('No supported API key variable in protected config')
headers={'xi-api-key':key,'Content-Type':'application/json'}
sub=requests.get('https://api.elevenlabs.io/v1/user/subscription',headers=headers,timeout=30)
tier=sub.json().get('tier','unverified: API key lacks user_read') if sub.ok else 'unverified: API key lacks user_read'
if tier.startswith('unverified'):tier='free (user confirmed)'
voice='iP95p4xoKVk53GoZ742B';model='eleven_multilingual_v2'
segments=[];captions=[];offset=0;script=[]
for i,(_,_,_,copy) in enumerate(SCENES):
 audio=REEL/f'voice-{i+1:02d}.mp3';alignment=REEL/f'alignment-{i+1:02d}.json'
 cached=json.loads(alignment.read_text()) if alignment.exists() else {}
 if audio.exists() and cached.get('_request_text')==copy:data=cached
 else:
  r=requests.post(f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps',params={'output_format':'mp3_44100_128'},headers=headers,json={'text':copy,'model_id':model,'voice_settings':{'stability':.45,'similarity_boost':.8,'style':.2,'use_speaker_boost':True,'speed':1.03}},timeout=120)
  r.raise_for_status();data=r.json();audio.write_bytes(base64.b64decode(data.pop('audio_base64')));data['_request_text']=copy;alignment.write_text(json.dumps(data,indent=2))
 a=data.get('normalized_alignment') or data['alignment'];chars=a['characters'];starts=a['character_start_times_seconds'];ends=a['character_end_times_seconds']
 length=ends[-1]+.50;duration=round(max(length,4.5)*30)/30
 wav=REEL/f'voice-{i+1:02d}.wav'
 subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error','-i',str(audio),'-af',f'apad=whole_dur={duration}', '-t',str(duration),'-ar','48000','-ac','1',str(wav)],check=True)
 # Group short readable captions using actual character timestamps.
 words=[];buf='';st=0
 for j,ch in enumerate(chars):
  if not buf:st=starts[j]
  buf+=ch
  if ch.isspace() or j==len(chars)-1:
   if buf.strip():words.append((buf.strip(),st,ends[j]))
   buf=''
 group=[]
 for w in words:
  group.append(w)
  sentence=w[0].endswith(('.', '?','!'))
  if len(' '.join(x[0] for x in group))>=48 or sentence:
   captions.append({'start':round(offset+group[0][1],3),'end':round(offset+group[-1][2],3),'text':' '.join(x[0] for x in group).replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook')});group=[]
 if group:captions.append({'start':round(offset+group[0][1],3),'end':round(offset+group[-1][2],3),'text':' '.join(x[0] for x in group).replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook')})
 segments.append({'index':i+1,'start':offset,'duration':duration,'file':wav.name});script.append(copy);offset+=duration
 print(f'Scene {i+1}: {duration:.2f}s, ElevenLabs Chris',flush=True)
(REEL/'voice-concat.txt').write_text(''.join(f"file '{s['file']}'\n" for s in segments))
subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(REEL/'voice-concat.txt'),'-c','copy',str(REEL/'voiceover.wav')],check=True)
subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error','-i',str(REEL/'voiceover.wav'),'-c:a','libmp3lame','-q:a','2',str(REEL/'voiceover.mp3')],check=True)
(REEL/'timing.json').write_text(json.dumps(segments,indent=2));(REEL/'captions.json').write_text(json.dumps(captions,indent=2));(REEL/'narration.txt').write_text('\n\n'.join(script)+'\n')
def stamp(t):
 n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
(REEL/'narration.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))+'\n')
(REEL/'voice-production.json').write_text(json.dumps({'provider':'ElevenLabs','voice':'Chris - Charming, Down-to-Earth','voice_id':voice,'model':model,'subscription_tier_at_generation':tier,'tone':'Friendly, upbeat, conversational American male','generated_at':'2026-11-21','total_seconds':offset,'synthetic_voice':True,'permitted_campaign_use':'User-stated noncommercial; free-plan title attribution required','attribution_title':'Coming soon: the new MyTailLog | Voice: elevenlabs.io'},indent=2))
print(f'Complete: {offset:.2f}s; subscription {tier}; actual alignment captions')
