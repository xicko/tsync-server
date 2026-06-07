import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateDenyDto {
  @IsString()
  @IsNotEmpty()
  type: 'text' | 'packageIdentifier';

  @IsString()
  @IsOptional()
  tailscaleId?: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  packageIdentifier?: string;
}
