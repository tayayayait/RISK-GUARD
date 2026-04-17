import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import type { AssessmentData } from "@/types/assessment";
import type { AccidentReportData } from "@/types/formTemplate";
import { format } from "date-fns";

interface Props {
  data: AccidentReportData;
  onChange: (fieldPath: string, value: unknown) => void;
  assessment?: AssessmentData | null;
  readOnly?: boolean;
  containerId?: string;
}

function AutoResizingTextarea({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full overflow-hidden resize-none bg-transparent outline-none ${className}`}
      rows={1}
    />
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center space-x-1 cursor-pointer">
      <div
        className="w-3 h-3 border border-black flex items-center justify-center text-xs"
        onClick={() => !disabled && onChange(!checked)}
      >
        {checked ? "✓" : ""}
      </div>
      <span>{label}</span>
    </label>
  );
}

export function AccidentReportForm({ data, onChange, readOnly, containerId }: Props) {
  const handleInputChange = (path: string, val: string | boolean) => {
    onChange(path, val);
  };

  const b = data.businessInfo;
  const v = data.victimInfo;
  const a = data.accidentDetails;
  const p = data.preventionPlan;
  const admin = data.administrativeInfo;

  return (
    <div
      id={containerId}
      className="mx-auto w-full max-w-[794px] bg-white p-8 text-[11px] leading-tight text-black font-sans shadow-md"
    >
      <div className="mb-4 text-center">
        <p className="text-[10px] text-left">■ 산업안전보건법 시행규칙 [별지 제30호서식]</p>
        <h1 className="text-2xl font-bold tracking-widest mt-2">산 업 재 해 조 사 표</h1>
      </div>

      <table className="w-full border-collapse mb-1 uppercase text-center table-fixed [&_th]:border [&_th]:border-gray-500 [&_th]:bg-gray-100 [&_th]:p-1 [&_td]:border [&_td]:border-gray-500 [&_td]:p-1">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[35%]" />
          <col className="w-[15%]" />
          <col className="w-[35%]" />
        </colgroup>
        <tbody>
          <tr>
            <th>접수번호</th>
            <td>
              <input
                className="w-full bg-transparent text-center outline-none"
                value={admin.receiptNumber}
                onChange={(e) => handleInputChange("administrativeInfo.receiptNumber", e.target.value)}
                disabled={readOnly}
              />
            </td>
            <th>접수일자</th>
            <td>
              <input
                className="w-full bg-transparent text-center outline-none"
                value={admin.receiptDate}
                onChange={(e) => handleInputChange("administrativeInfo.receiptDate", e.target.value)}
                disabled={readOnly}
              />
            </td>
          </tr>
          <tr>
            <th>처리일자</th>
            <td>
              <input
                className="w-full bg-transparent text-center outline-none"
                value={admin.processingDate}
                onChange={(e) => handleInputChange("administrativeInfo.processingDate", e.target.value)}
                disabled={readOnly}
              />
            </td>
            <th>처리기간</th>
            <td>
              <input
                className="w-full bg-transparent text-center outline-none"
                value={admin.processingPeriodDays}
                onChange={(e) => handleInputChange("administrativeInfo.processingPeriodDays", e.target.value)}
                disabled={readOnly}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="text-[9px] mb-2 text-right">※ 뒤쪽의 작성방법을 읽고 작성하시기 바라며, [ ]에는 해당되는 곳에 ✓ 표시를 합니다. (앞쪽)</div>

      <table className="w-full border-collapse border-2 border-black [&_th]:border [&_th]:border-black [&_th]:p-1 [&_th]:font-normal [&_td]:border [&_td]:border-black [&_td]:p-1 [&_td]:text-left">
        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[15%]" />
          <col className="w-[25%]" />
          <col className="w-[15%]" />
          <col className="w-[25%]" />
        </colgroup>
        <tbody>
          {/* I. 사업장 정보 */}
          <tr>
            <th rowSpan={8} className="text-center font-bold">
              I.<br />사업장<br />정보
            </th>
            <th colSpan={2} className="bg-gray-50">①산재관리번호<br />(사업개시번호)</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.managementNumber}
                onChange={(e) => handleInputChange("businessInfo.managementNumber", e.target.value)}
                disabled
              />
            </td>
            <th className="bg-gray-50">사업자등록번호</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.businessNumber}
                onChange={(e) => handleInputChange("businessInfo.businessNumber", e.target.value)}
                disabled
              />
            </td>
          </tr>
          <tr>
            <th colSpan={2} className="bg-gray-50">②사업장명</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.businessName}
                onChange={(e) => handleInputChange("businessInfo.businessName", e.target.value)}
                disabled
              />
            </td>
            <th className="bg-gray-50">③근로자 수</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.workersCount}
                onChange={(e) => handleInputChange("businessInfo.workersCount", e.target.value)}
                disabled={readOnly}
              />
            </td>
          </tr>
          <tr>
            <th colSpan={2} className="bg-gray-50">④업종</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.industry}
                onChange={(e) => handleInputChange("businessInfo.industry", e.target.value)}
                disabled
              />
            </td>
            <th className="bg-gray-50">소재지</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.address}
                onChange={(e) => handleInputChange("businessInfo.address", e.target.value)}
                disabled
              />
            </td>
          </tr>
          <tr>
            <th rowSpan={2} className="bg-gray-50 text-center">⑤재해자가 사내<br />수급인 소속인 경우<br />(건설업 제외)</th>
            <th className="bg-gray-50 text-center">원도급인 사업장명</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.subcontractorInfo.businessName}
                onChange={(e) => handleInputChange("businessInfo.subcontractorInfo.businessName", e.target.value)}
                disabled={readOnly}
              />
            </td>
            <th rowSpan={2} className="bg-gray-50 text-center">⑥재해자가 파견<br />근로자인 경우</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.dispatchedInfo.businessName}
                onChange={(e) => handleInputChange("businessInfo.dispatchedInfo.businessName", e.target.value)}
                disabled={readOnly}
                placeholder="파견사업주 사업장명"
              />
            </td>
          </tr>
          <tr>
            <th className="bg-gray-50 text-center">사업장 산재관리번호</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.subcontractorInfo.managementNumber}
                onChange={(e) => handleInputChange("businessInfo.subcontractorInfo.managementNumber", e.target.value)}
                disabled={readOnly}
              />
            </td>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.dispatchedInfo.managementNumber}
                onChange={(e) => handleInputChange("businessInfo.dispatchedInfo.managementNumber", e.target.value)}
                disabled={readOnly}
                placeholder="파견사업주 산재관리번호"
              />
            </td>
          </tr>
          <tr>
            <th rowSpan={3} className="bg-gray-50 text-center">건설업만<br />작성</th>
            <th className="bg-gray-50 text-center">발주자</th>
            <td colSpan={3}>
              <div className="flex gap-4">
                <Checkbox label="민간" checked={b.constructionInfo.orderer === "private"} onChange={() => handleInputChange("businessInfo.constructionInfo.orderer", "private")} disabled={readOnly} />
                <Checkbox label="국가·지방자치단체" checked={b.constructionInfo.orderer === "national"} onChange={() => handleInputChange("businessInfo.constructionInfo.orderer", "national")} disabled={readOnly} />
                <Checkbox label="공공기관" checked={b.constructionInfo.orderer === "public_institution"} onChange={() => handleInputChange("businessInfo.constructionInfo.orderer", "public_institution")} disabled={readOnly} />
              </div>
            </td>
          </tr>
          <tr>
            <th className="bg-gray-50 text-center">⑦원수급 사업장명<br />⑧원수급 산재관리번호</th>
            <td>
              <input
                className="w-full bg-transparent outline-none mb-1 border-b border-gray-300 border-dashed"
                value={b.constructionInfo.principalBusinessName}
                onChange={(e) => handleInputChange("businessInfo.constructionInfo.principalBusinessName", e.target.value)}
                disabled={readOnly}
                placeholder="사업장명"
              />
              <input
                className="w-full bg-transparent outline-none"
                value={b.constructionInfo.principalManagementNumber}
                onChange={(e) => handleInputChange("businessInfo.constructionInfo.principalManagementNumber", e.target.value)}
                disabled={readOnly}
                placeholder="산재관리번호"
              />
            </td>
            <th className="bg-gray-50 text-center">공사현장 명</th>
            <td>
               <input
                className="w-full bg-transparent outline-none"
                value={b.constructionInfo.constructionSiteName}
                onChange={(e) => handleInputChange("businessInfo.constructionInfo.constructionSiteName", e.target.value)}
                disabled={readOnly}
              />
            </td>
          </tr>
          <tr>
             <th className="bg-gray-50 text-center">⑨공사종류</th>
             <td>
              <input
                className="w-full bg-transparent outline-none"
                value={b.constructionInfo.constructionType}
                onChange={(e) => handleInputChange("businessInfo.constructionInfo.constructionType", e.target.value)}
                disabled={readOnly}
              />
             </td>
             <td colSpan={2}>
               <div className="flex gap-2 items-center justify-around">
                 <span>공정률: <input className="w-12 text-center bg-transparent border-b border-gray-400" value={b.constructionInfo.progressRate} onChange={(e) => handleInputChange("businessInfo.constructionInfo.progressRate", e.target.value)} disabled={readOnly} /> %</span>
                 <span>공사금액: <input className="w-16 text-center bg-transparent border-b border-gray-400" value={b.constructionInfo.constructionAmount} onChange={(e) => handleInputChange("businessInfo.constructionInfo.constructionAmount", e.target.value)} disabled={readOnly} /> 백만원</span>
               </div>
             </td>
          </tr>

          {/* II. 재해 정보 */}
          <tr>
            <td colSpan={6} className="bg-gray-100 text-[10px] text-center border-y-2 border-black">
              ※ 아래 항목은 재해자별로 각각 작성하되, 같은 재해로 재해자가 여러 명이 발생한 경우에는 별지에 추가로 적습니다.
            </td>
          </tr>
          <tr>
            <th rowSpan={5} className="text-center font-bold">
              II.<br />재해<br />정보
            </th>
            <th colSpan={2} className="bg-gray-50 text-center">성명</th>
            <td>
              <input
                className="w-full bg-transparent outline-none"
                value={v.name}
                onChange={(e) => handleInputChange("victimInfo.name", e.target.value)}
                disabled={readOnly}
              />
            </td>
            <th className="bg-gray-50 text-center">주민등록번호</th>
            <td>
               <input
                className="w-full bg-transparent outline-none"
                value={v.residentNumber}
                onChange={(e) => handleInputChange("victimInfo.residentNumber", e.target.value)}
                disabled={readOnly}
                placeholder="앞 7자리만 기입"
                maxLength={8}
              />
            </td>
          </tr>
          <tr>
            <th colSpan={2} className="bg-gray-50 text-center">주소</th>
            <td colSpan={3}>
              <div className="flex w-full">
                <input
                  className="flex-1 bg-transparent outline-none border-r border-gray-400 mr-2 pr-2"
                  value={v.address}
                  onChange={(e) => handleInputChange("victimInfo.address", e.target.value)}
                  disabled={readOnly}
                />
                <span className="shrink-0 bg-gray-50 px-2 mr-2">휴대전화</span>
                <input
                  className="w-32 bg-transparent outline-none"
                  value={v.phone}
                  onChange={(e) => handleInputChange("victimInfo.phone", e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </td>
          </tr>
          <tr>
             <th colSpan={2} className="bg-gray-50 text-center">국 적</th>
             <td colSpan={3}>
                <div className="flex gap-4 items-center mb-1">
                  <Checkbox label="내국인" checked={v.nationalityType === "domestic"} onChange={() => handleInputChange("victimInfo.nationalityType", "domestic")} disabled={readOnly} />
                  <Checkbox label="외국인" checked={v.nationalityType === "foreign"} onChange={() => handleInputChange("victimInfo.nationalityType", "foreign")} disabled={readOnly} />
                  <span>[국적: <input className="w-16 border-b border-gray-400 bg-transparent outline-none text-center" value={v.nationality} onChange={(e) => handleInputChange("victimInfo.nationality", e.target.value)} disabled={readOnly}/>]</span>
                  <span>⑩체류자격: <input className="w-16 border-b border-gray-400 bg-transparent outline-none text-center" value={v.visaType} onChange={(e) => handleInputChange("victimInfo.visaType", e.target.value)} disabled={readOnly}/></span>
                  <span className="bg-gray-50 px-2 ml-auto">⑪직업</span>
                  <input className="w-24 border-b border-gray-400 bg-transparent outline-none text-center" value={v.jobTitle} onChange={(e) => handleInputChange("victimInfo.jobTitle", e.target.value)} disabled={readOnly}/>
                </div>
             </td>
          </tr>
          <tr>
             <th className="bg-gray-50 text-center" colSpan={2}>입사일 / 근속기간</th>
             <td colSpan={3}>
                <div className="flex gap-4 items-center">
                  <span>입사일: <input className="w-32 border-b border-gray-400 bg-transparent outline-none text-center" placeholder="YYYY-MM-DD" value={v.hireDate} onChange={(e) => handleInputChange("victimInfo.hireDate", e.target.value)} disabled={readOnly}/></span>
                  <span className="bg-gray-50 px-2 flex-1 text-center">⑫같은 종류업무 근속기간</span>
                  <span><input className="w-10 border-b border-gray-400 bg-transparent outline-none text-center" value={v.experienceYears} onChange={(e) => handleInputChange("victimInfo.experienceYears", e.target.value)} disabled={readOnly}/>년</span>
                  <span><input className="w-10 border-b border-gray-400 bg-transparent outline-none text-center" value={v.experienceMonths} onChange={(e) => handleInputChange("victimInfo.experienceMonths", e.target.value)} disabled={readOnly}/>월</span>
                </div>
             </td>
          </tr>
          <tr>
            <th colSpan={5} className="p-0">
               <div className="border-b border-black p-1 flex gap-2 items-center flex-wrap">
                 <span className="bg-gray-50 font-bold shrink-0">⑬고용형태</span>
                 <Checkbox label="상용" checked={v.employmentType==="regular"} onChange={()=>handleInputChange("victimInfo.employmentType","regular")} disabled={readOnly} />
                 <Checkbox label="임시" checked={v.employmentType==="temporary"} onChange={()=>handleInputChange("victimInfo.employmentType","temporary")} disabled={readOnly} />
                 <Checkbox label="일용" checked={v.employmentType==="daily"} onChange={()=>handleInputChange("victimInfo.employmentType","daily")} disabled={readOnly} />
                 <Checkbox label="무급가족종사자" checked={v.employmentType==="unpaid_family"} onChange={()=>handleInputChange("victimInfo.employmentType","unpaid_family")} disabled={readOnly} />
                 <Checkbox label="자영업자" checked={v.employmentType==="self_employed"} onChange={()=>handleInputChange("victimInfo.employmentType","self_employed")} disabled={readOnly} />
                 <Checkbox label="그밖의사항" checked={v.employmentType==="other"} onChange={()=>handleInputChange("victimInfo.employmentType","other")} disabled={readOnly} />
               </div>
               <div className="border-b border-black p-1 flex gap-2 items-center flex-wrap">
                 <span className="bg-gray-50 font-bold shrink-0">⑭근무형태</span>
                 <Checkbox label="정상" checked={v.workType==="regular"} onChange={()=>handleInputChange("victimInfo.workType","regular")} disabled={readOnly} />
                 <Checkbox label="2교대" checked={v.workType==="shift_2"} onChange={()=>handleInputChange("victimInfo.workType","shift_2")} disabled={readOnly} />
                 <Checkbox label="3교대" checked={v.workType==="shift_3"} onChange={()=>handleInputChange("victimInfo.workType","shift_3")} disabled={readOnly} />
                 <Checkbox label="4교대" checked={v.workType==="shift_4"} onChange={()=>handleInputChange("victimInfo.workType","shift_4")} disabled={readOnly} />
                 <Checkbox label="시간제" checked={v.workType==="part_time"} onChange={()=>handleInputChange("victimInfo.workType","part_time")} disabled={readOnly} />
                 <Checkbox label="그밖의사항" checked={v.workType==="other"} onChange={()=>handleInputChange("victimInfo.workType","other")} disabled={readOnly} />
               </div>
               <div className="p-1 flex gap-4 items-center">
                  <span className="bg-gray-50 font-bold">⑮상해종류</span>
                  <input className="w-24 border-b border-gray-400 bg-transparent outline-none" value={v.injuryType} onChange={(e)=>handleInputChange("victimInfo.injuryType", e.target.value)} disabled={readOnly} />
                  <span className="bg-gray-50 font-bold">⑯상해부위</span>
                  <input className="w-24 border-b border-gray-400 bg-transparent outline-none" value={v.injuryPart} onChange={(e)=>handleInputChange("victimInfo.injuryPart", e.target.value)} disabled={readOnly} />
                  <span className="bg-gray-50 font-bold ml-auto">⑰휴업예상일수</span>
                  <span>휴업 <input className="w-10 border-b border-gray-400 bg-transparent outline-none text-center" value={v.expectedRestDays} onChange={(e)=>handleInputChange("victimInfo.expectedRestDays", e.target.value)} disabled={readOnly} />일</span>
                  <span className="bg-gray-50 font-bold">사망 여부</span>
                  <Checkbox label="사망" checked={v.isDead} onChange={(val)=>handleInputChange("victimInfo.isDead", val)} disabled={readOnly} />
               </div>
            </th>
          </tr>

          {/* III. 재해발생 개요 및 원인 */}
          <tr>
             <th rowSpan={4} className="text-center font-bold border-t-2 border-black">
               III.<br />재해<br />발생<br />개요 및<br />원인
             </th>
             <th rowSpan={3} className="bg-gray-50 text-center border-t-2 border-black">
               18<br />재해<br />발생<br />개요
             </th>
             <th className="bg-gray-50 text-center border-t-2 border-black">발생일시</th>
             <td colSpan={3} className="border-t-2 border-black">
               <div className="flex items-center">
                 <input className="w-12 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.year} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.year", e.target.value)} disabled={readOnly}/> 년
                 <input className="w-8 ml-2 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.month} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.month", e.target.value)} disabled={readOnly}/> 월
                 <input className="w-8 ml-2 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.day} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.day", e.target.value)} disabled={readOnly}/> 일
                 <input className="w-8 ml-2 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.dayOfWeek} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.dayOfWeek", e.target.value)} disabled={readOnly}/> 요일
                 <input className="w-8 ml-2 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.hour} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.hour", e.target.value)} disabled={readOnly}/> 시
                 <input className="w-8 ml-2 text-center border-b border-gray-400 bg-transparent outline-none" value={a.occurredDate.minute} onChange={(e)=>handleInputChange("accidentDetails.occurredDate.minute", e.target.value)} disabled={readOnly}/> 분
               </div>
             </td>
          </tr>
          <tr>
             <th className="bg-gray-50 text-center">발생장소</th>
             <td colSpan={3}>
               <input className="w-full bg-transparent outline-none" value={a.location} onChange={(e)=>handleInputChange("accidentDetails.location", e.target.value)} disabled={readOnly}/>
             </td>
          </tr>
          <tr>
             <th className="bg-gray-50 text-center">재해관련 작업유형 <br /><span className="font-normal text-xs">(당시 상황)</span></th>
             <td colSpan={3}>
               <AutoResizingTextarea
                 value={a.situation}
                 onChange={(val) => handleInputChange("accidentDetails.situation", val)}
                 disabled={readOnly}
                 className="min-h-[60px] text-blue-800"
               />
             </td>
          </tr>
          <tr>
             <th colSpan={2} className="bg-gray-50 text-center">19 재해발생원인</th>
             <td colSpan={3}>
               <AutoResizingTextarea
                 value={a.cause.join("\n")}
                 onChange={(val) => handleInputChange("accidentDetails.cause", val.split("\n"))}
                 disabled={readOnly}
                 className="min-h-[60px] text-blue-800"
               />
             </td>
          </tr>

          {/* IV. 재발방지계획 */}
          <tr>
            <th className="text-center font-bold">
               IV.<br />20재발<br />방지<br />계획
            </th>
            <td colSpan={5}>
               <AutoResizingTextarea
                 value={p.plan}
                 onChange={(val) => handleInputChange("preventionPlan.plan", val)}
                 disabled={readOnly}
                 className="min-h-[80px] text-blue-800"
               />
            </td>
          </tr>

          {/* Footer Notices */}
          <tr>
            <td colSpan={6} className="p-2 text-left text-[11px]">
              <div className="space-y-2 leading-relaxed">
                <p className="break-keep">
                  ※ 재발방지계획 항목은 작성할 내용이 많은 경우 별지 추가가 가능합니다.
                </p>
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 break-keep">
                    ※ 한국산업안전보건공단에서 무료로 제공하고 있으니 즉시 기술지원 서비스를 받으려는 경우 오른쪽에 ✓ 표시를 하시기 바랍니다.
                  </p>
                  <span className="shrink-0 border border-black bg-gray-50 px-2 py-1">
                    <Checkbox
                      label="즉시 기술지원 서비스 요청"
                      checked={p.requestTechnicalSupport}
                      onChange={(val) => handleInputChange("preventionPlan.requestTechnicalSupport", val)}
                      disabled={readOnly}
                    />
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 break-keep">
                    ※ 근로복지공단은 재해자의 개인정보를 활용하는 것에 동의하는 사람에 한정하여 해당 재해자에게 산재보험급여 신청방법 안내하고 있으니 동의 바랍니다.
                  </p>
                  <span className="shrink-0 border border-black bg-gray-50 px-2 py-1">
                    <Checkbox
                      label="산재보험급여 신청안내 동의"
                      checked={p.consentPersonalData}
                      onChange={(val) => handleInputChange("preventionPlan.consentPersonalData", val)}
                      disabled={readOnly}
                    />
                  </span>
                </div>
              </div>
            </td>
          </tr>
          <tr>
             <td colSpan={6} className="p-4">
               <div className="flex flex-wrap items-center justify-start gap-x-6 gap-y-2">
                 <div className="flex items-center gap-2">
                   <span className="whitespace-nowrap">작성자 성명:</span>
                   <input
                     className="w-36 border-b border-black bg-transparent text-center outline-none"
                     value={admin.writerName}
                     onChange={(e) => handleInputChange("administrativeInfo.writerName", e.target.value)}
                     disabled={readOnly}
                   />
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="whitespace-nowrap">전화번호:</span>
                   <input
                     className="w-36 border-b border-black bg-transparent text-center outline-none"
                     value={admin.writerPhone}
                     onChange={(e) => handleInputChange("administrativeInfo.writerPhone", e.target.value)}
                     disabled={readOnly}
                   />
                 </div>
                 <div className="flex items-center gap-1">
                   <span className="whitespace-nowrap">작성일:</span>
                   <input
                     className="w-14 border-b border-black bg-transparent text-center outline-none"
                     value={admin.writtenYear}
                     onChange={(e) => handleInputChange("administrativeInfo.writtenYear", e.target.value)}
                     disabled={readOnly}
                   />
                   <span>년</span>
                   <input
                     className="w-10 border-b border-black bg-transparent text-center outline-none"
                     value={admin.writtenMonth}
                     onChange={(e) => handleInputChange("administrativeInfo.writtenMonth", e.target.value)}
                     disabled={readOnly}
                   />
                   <span>월</span>
                   <input
                     className="w-10 border-b border-black bg-transparent text-center outline-none"
                     value={admin.writtenDay}
                     onChange={(e) => handleInputChange("administrativeInfo.writtenDay", e.target.value)}
                     disabled={readOnly}
                   />
                   <span>일</span>
                 </div>
               </div>
               <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                 <div className="flex items-center gap-2">
                   <span className="w-20 shrink-0">사업장 대표:</span>
                   <input
                     className="w-32 border-b border-black bg-transparent text-center outline-none"
                     value={admin.employerName}
                     onChange={(e) => handleInputChange("administrativeInfo.employerName", e.target.value)}
                     disabled={readOnly}
                   />
                   <span className="shrink-0">(서명 또는 인)</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="w-20 shrink-0">근로자 대표:</span>
                   <input
                     className="w-32 border-b border-black bg-transparent text-center outline-none"
                     value={admin.workerRepresentativeName}
                     onChange={(e) => handleInputChange("administrativeInfo.workerRepresentativeName", e.target.value)}
                     disabled={readOnly}
                   />
                   <span className="shrink-0">(서명 또는 인)</span>
                 </div>
               </div>
             </td>
          </tr>
          <tr>
             <td colSpan={6} className="text-center text-lg font-bold p-2 bg-gray-50 uppercase">
                <input className="w-48 border-b-2 border-black bg-transparent outline-none text-center inline-block" value={admin.laborOfficeName} onChange={(e)=>handleInputChange("administrativeInfo.laborOfficeName",e.target.value)} disabled={readOnly} /> 귀하
             </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
