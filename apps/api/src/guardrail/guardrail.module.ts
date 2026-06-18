import { Module } from '@nestjs/common';
import { InjectionFilter } from './injection-filter';
import { PiiRedactor } from './pii-redactor';
import { ConfidenceService } from './confidence.service';

@Module({
  providers: [InjectionFilter, PiiRedactor, ConfidenceService],
  exports: [InjectionFilter, PiiRedactor, ConfidenceService],
})
export class GuardrailModule {}
